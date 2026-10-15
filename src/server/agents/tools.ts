import { isDeepStrictEqual } from "node:util";
import type { ToolSet, ToolCallOptions } from "ai";
import type { AgentToolOperation } from "@prisma/client";
import { db } from "@/server/db";
import { json } from "./service";
import {
  AgentExecutionError,
  AgentExecutionSuspended,
  type AgentExecutionContext,
} from "./registry";

export type ToolRecovery = "read" | "idempotent" | "once";
const policies = new Map<string, ToolRecovery>();

/** Opt in only when the owning tool actually supplies the recovery guarantee. */
export function registerToolRecovery(name: string, recovery: ToolRecovery) {
  policies.set(name, recovery);
}

export function operationOutput(operation: AgentToolOperation): unknown {
  const output = operation.output as { value?: unknown } | null;
  return output?.value;
}

export function durableTools(
  context: AgentExecutionContext,
  originals: ToolSet,
) {
  let tail: Promise<unknown> = Promise.resolve();
  let suspended: AgentExecutionSuspended | undefined;
  let halted: AgentExecutionError | undefined;
  const execute = async (
    name: string,
    input: unknown,
    options: ToolCallOptions,
  ) => {
    if (halted) throw halted;
    if (suspended) throw suspended;
    await context.check();
    const tool = originals[name];
    if (!tool?.execute) throw new AgentExecutionError("TOOL_UNAVAILABLE");
    const existing = await context.commit((tx) =>
      tx.agentToolOperation.upsert({
        where: {
          runId_toolCallId: {
            runId: context.run.id,
            toolCallId: options.toolCallId,
          },
        },
        create: {
          runId: context.run.id,
          toolCallId: options.toolCallId,
          toolName: name,
          input: json(input),
        },
        update: {},
      }),
    );
    if (
      existing.toolName !== name ||
      !isDeepStrictEqual(existing.input, json(input))
    )
      throw new AgentExecutionError("TOOL_IDENTITY_CONFLICT");
    if (existing.status === "SUCCEEDED") return operationOutput(existing);
    const recovery = policies.get(name) ?? "once";
    if (
      (existing.status === "RUNNING" ||
        existing.status === "UNKNOWN" ||
        existing.status === "WAITING") &&
      recovery === "once"
    ) {
      await db.agentToolOperation.updateMany({
        where: {
          id: existing.id,
          status: { in: ["RUNNING", "UNKNOWN", "WAITING"] },
        },
        data: { status: "UNKNOWN" },
      });
      const outcome = await db.agentToolOperation.findUniqueOrThrow({
        where: { id: existing.id },
      });
      if (outcome.status === "SUCCEEDED") return operationOutput(outcome);
      halted = new AgentExecutionError("TOOL_OUTCOME_UNKNOWN");
      throw halted;
    }
    await context.commit((tx) =>
      tx.agentToolOperation.update({
        where: { id: existing.id },
        data: {
          status: "RUNNING",
          executionEpoch: context.run.epoch,
        },
      }),
    );
    try {
      let output: unknown = await tool.execute(input, {
        ...options,
        toolCallId: existing.id,
        abortSignal: context.signal,
        experimental_context: {
          operationId: existing.id,
          runId: context.run.id,
        },
      });
      if (
        output &&
        typeof output === "object" &&
        Symbol.asyncIterator in output
      ) {
        for await (const value of output as AsyncIterable<unknown>)
          output = value;
      }
      const waiting =
        !!output &&
        typeof output === "object" &&
        "pending" in output &&
        output.pending === true;
      // Record actual outcomes even if cancellation happened while an effect was in flight.
      await db.agentToolOperation.updateMany({
        where: { id: existing.id, executionEpoch: context.run.epoch },
        data: {
          status: waiting ? "WAITING" : "SUCCEEDED",
          output: json({ value: output ?? null }),
        },
      });
      if (waiting)
        suspended = new AgentExecutionSuspended(
          "TOOL_PENDING",
          new Date(Date.now() + 5_000),
        );
      return output;
    } catch (error) {
      halted = new AgentExecutionError(
        recovery === "once" ? "TOOL_OUTCOME_UNKNOWN" : "TOOL_FAILED",
      );
      await db.agentToolOperation.updateMany({
        where: {
          id: existing.id,
          executionEpoch: context.run.epoch,
          status: "RUNNING",
        },
        data: { status: recovery === "once" ? "UNKNOWN" : "PREPARED" },
      });
      throw error;
    }
  };
  const tools: ToolSet = {};
  for (const [name, original] of Object.entries(originals)) {
    tools[name] = {
      ...original,
      execute: original.execute
        ? (input, options) => {
            const next = tail.then(() => execute(name, input, options));
            tail = next.catch(() => undefined);
            return next;
          }
        : undefined,
    };
  }
  return {
    tools,
    get suspended() {
      return suspended;
    },
    async restore(messages: ToolCallOptions["messages"]) {
      const operations = await db.agentToolOperation.findMany({
        where: { runId: context.run.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      for (const operation of operations) {
        if (operation.status !== "SUCCEEDED") {
          await execute(operation.toolName, operation.input, {
            toolCallId: operation.toolCallId,
            messages,
            abortSignal: context.signal,
          });
          if (suspended) break;
        }
      }
    },
  };
}
