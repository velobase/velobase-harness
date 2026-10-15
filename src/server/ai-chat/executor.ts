import { reconcileTools } from "./tool-projection";
import { readUIMessageStream, convertToModelMessages } from "ai";
import { streamChat } from "@velobase/ai-chat";
import { createOpenRouterChatModel } from "@velobase/ai-chat-openrouter";
import { db } from "@/server/db";
import { env } from "@/env";
import { isFeatureEnabled } from "@/server/features/state";
import {
  AgentExecutionError,
  AgentExecutionSuspended,
  registerAgentExecutor,
  type AgentExecutor,
} from "@/server/agents/registry";
import { json } from "@/server/agents/service";
import { durableTools } from "@/server/agents/tools";
import { calculateChatCost } from "@/server/billing/config/token-pricing";
import { settleDeduction } from "@/server/billing/services/post-consume";
import type { ChatUIMessage } from "@/types/ai-chat/message";
import { chatRunInputSchema } from "./input";
import { interactionPath } from "./history";
import { buildAIProjection } from "./services/projection.service";
import {
  prepareTools,
  filterMessagesForAgent,
} from "./services/tool-preparation.service";

const MAX_STEPS = 12;
const MAX_RUN_AGE = 24 * 60 * 60 * 1000;

const executor: AgentExecutor = {
  async authorize(run) {
    const input = chatRunInputSchema.parse(run.input);
    if (
      await db.agentToolOperation.count({
        where: {
          status: "UNKNOWN",
          runId: { not: run.id },
          run: { serialKey: run.serialKey },
        },
      })
    )
      throw new AgentExecutionError("TOOL_OUTCOME_UNKNOWN");
    if (Date.now() - run.createdAt.getTime() > MAX_RUN_AGE)
      throw new AgentExecutionError("EXECUTION_EXPIRED");
    if (!(await isFeatureEnabled("ai-chat")))
      throw new AgentExecutionSuspended("FEATURE_DISABLED");
    const conversation = await db.conversation.findUnique({
      where: { id: input.conversationId },
    });
    if (
      !conversation ||
      (input.userId
        ? conversation.userId !== input.userId
        : !input.guestOwnerHash ||
          conversation.guestOwnerHash !== input.guestOwnerHash)
    )
      throw new AgentExecutionError("AUTHORITY_REVOKED");
    if (conversation.projectId !== (input.projectId ?? null))
      throw new AgentExecutionError("AUTHORITY_REVOKED");
    if (input.userId) {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: { isBlocked: true },
      });
      const installation = await db.userAgent.findFirst({
        where: {
          id: input.userAgentId,
          userId: input.userId,
          agentId: input.agent.id,
          enabled: true,
          agent: { enabled: true },
        },
        include: { agent: true },
      });
      if (
        !user ||
        user.isBlocked ||
        !installation ||
        input.agent.tools.some(
          (tool) => !installation.agent.tools.includes(tool),
        )
      )
        throw new AgentExecutionError("AUTHORITY_REVOKED");
      if (
        input.projectId &&
        !(await db.project.count({
          where: { id: input.projectId, userId: input.userId },
        }))
      )
        throw new AgentExecutionError("AUTHORITY_REVOKED");
    } else if (
      !(await db.agent.count({
        where: { id: input.agent.id, enabled: true, isSystem: true },
      }))
    ) {
      throw new AgentExecutionError("AUTHORITY_REVOKED");
    }
  },
  async execute(context) {
    const input = chatRunInputSchema.parse(context.run.input);
    const rows = await db.interaction.findMany({
      where: { conversationId: input.conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1000,
    });
    const path = interactionPath(rows, input.assistantMessageId);
    const tools = prepareTools(input.userId ? input.agent.tools : [], {
      userId: input.userId,
      conversationId: input.conversationId,
      projectId: input.projectId,
    });
    const durable = durableTools(context, tools);
    let messages = filterMessagesForAgent(
      buildAIProjection(path),
      tools,
      input.conversationId,
    );
    let latest = messages.at(-1)!;
    const save = async (message: ChatUIMessage) => {
      latest = await reconcileTools(context.run.id, message);
      await context.commit((tx) =>
        tx.interaction.update({
          where: { id: input.assistantMessageId },
          data: { parts: json(latest.parts) },
        }),
      );
    };
    const ensureToolsSettled = async () => {
      if (durable.suspended) throw durable.suspended;
      if (
        await db.agentToolOperation.count({
          where: { runId: context.run.id, status: "UNKNOWN" },
        })
      )
        throw new AgentExecutionError("TOOL_OUTCOME_UNKNOWN");
      if (
        await db.agentToolOperation.count({
          where: {
            runId: context.run.id,
            status: { in: ["PREPARED", "RUNNING"] },
          },
        })
      )
        throw new AgentExecutionError("TOOL_FAILED");
    };
    try {
      await durable.restore(
        convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
      );
      await save(latest);
      await ensureToolsSettled();
      messages = [...messages.slice(0, -1), latest];
      // Empty placeholders are for observation and are not model input.
      const modelMessages = messages.filter(
        (message) => message.parts.length > 0,
      );
      let steps = context.run.steps;
      const result = streamChat({
        model: createOpenRouterChatModel({
          apiKey: env.OPENROUTER_API_KEY ?? "",
          model: input.agent.model,
        }),
        messages: modelMessages,
        tools: durable.tools,
        system: input.agent.instructions,
        maxSteps: MAX_STEPS,
        maxOutputTokens: 4096,
        abortSignal: context.signal,
        prepareStep: async () => {
          await context.check();
          await ensureToolsSettled();
          if (steps >= MAX_STEPS) throw new AgentExecutionError("STEP_LIMIT");
          await context.commit((tx) =>
            tx.agentRun.update({
              where: { id: context.run.id },
              data: { steps: { increment: 1 } },
            }),
          );
          steps++;
          return {};
        },
        onStepFinish: async ({ usage }) => {
          await context.commit((tx) =>
            tx.agentRun.update({
              where: { id: context.run.id },
              data: {
                inputTokens: { increment: usage.inputTokens ?? 0 },
                outputTokens: { increment: usage.outputTokens ?? 0 },
              },
            }),
          );
        },
      });
      let lastSave = 0;
      for await (const message of readUIMessageStream<ChatUIMessage>({
        message: latest,
        stream: result.toUIMessageStream<ChatUIMessage>({
          originalMessages: messages,
          generateMessageId: () => input.assistantMessageId,
          sendReasoning: false,
        }),
        terminateOnError: true,
      })) {
        latest = message;
        if (Date.now() - lastSave >= 250) {
          await save(message);
          lastSave = Date.now();
        }
      }
      await save(latest);
      await ensureToolsSettled();
      const finishReason = await result.finishReason;
      if (finishReason !== "stop")
        throw new AgentExecutionError(
          finishReason === "length" ? "OUTPUT_LIMIT" : "INCOMPLETE_RESPONSE",
        );
    } catch (error) {
      // Provider errors may wrap the callback exception. Preserve stable recovery decisions.
      await context.check();
      await save(latest);
      await ensureToolsSettled();
      throw error;
    }
  },
  async settle(run) {
    const input = chatRunInputSchema.parse(run.input);
    if (
      !input.billable ||
      !input.userId ||
      !(run.inputTokens + run.outputTokens)
    )
      return;
    await settleDeduction({
      userId: input.userId,
      amount: calculateChatCost(
        input.agent.model,
        run.inputTokens,
        run.outputTokens,
      ),
      businessId: `chat_${run.id}`,
      businessType: "TOKEN_USAGE",
      description: `AI Chat - ${input.agent.model}`,
    });
  },
};

export function registerChatExecutor() {
  registerAgentExecutor("chat", executor);
}
