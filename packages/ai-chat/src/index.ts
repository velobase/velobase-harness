import {
  BACKGROUND_CONTEXT,
  withAbortSignal,
} from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import type {
  AssistantMessage,
  ImageContent,
  Message,
  TextContent,
  ToolCall,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai/models";
import {
  AssistantEntry,
  createRegistry,
  defineExtension,
  defineTool,
  GenerationTask,
  Harness,
  hook,
  LiveDoc,
  type EntryId,
  type EntryRecord,
  type JsonObject,
  type LiveState,
  type ModelRef,
  type Storage,
  type ToolExecutionResult,
  type ToolRegistration,
  ToolResultEntry,
  UserEntry,
  type UserInput,
} from "@earendil-works/pi-durable";
import { z } from "zod";
import {
  getToolName,
  isToolUIPart,
  zodToJsonSchema,
  type ChatTool,
  type ToolSet,
  type UIMessage,
  type UIMessagePart,
} from "./tools";

export * from "./tools";
export * from "./postgres-storage";

export const aiChatFeature = {
  id: "ai-chat",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/chat",
  connection: "ai",
} as const;

export interface PiChatModel {
  readonly provider: string;
  readonly modelId: string;
  readonly modelRef: ModelRef;
  readonly models: Models;
}

export interface DurableChatOptions<M extends UIMessage = UIMessage> {
  /** Explicitly constructed Pi model adapter. */
  model: PiChatModel;
  /** Persistent Storage backend (e.g. PostgresStorage or MemoryStorage). */
  storage: Storage;
  /** Conversation messages on the active branch. */
  messages: M[];
  /** Prepared tools for this conversation turn. */
  tools?: ToolSet;
  /** Optional tool replay policies keyed by tool name. */
  toolPolicies?:
    | ReadonlyMap<string, "safe" | "unsafe">
    | Readonly<Record<string, "safe" | "unsafe">>;
  /** System instructions for the agent. */
  system: string;
  /** Durable request ID (e.g. runId) for idempotent submission/recovery. */
  requestId: string;
  /** ID of the assistant message being produced. */
  assistantMessageId: string;
  /** Maximum tool rounds per run (default 10, max 100). */
  maxSteps?: number;
  /** Maximum output tokens per model step (default 4096). */
  maxOutputTokens?: number;
  /** Abort signal tied to the Worker lease/cancellation. */
  abortSignal?: AbortSignal;
  /** Called before each model step and tool dispatch. */
  onStepStart?: () => Promise<void> | void;
  /** Called after each completed model response with token usage. */
  onStepFinish?: (event: {
    usage: { inputTokens: number; outputTokens: number };
  }) => Promise<void> | void;
  /** Called when the projected assistant UIMessage changes during streaming or tool execution. */
  onProgress?: (message: M) => Promise<void> | void;
}

export interface DurableChatResult<M extends UIMessage = UIMessage> {
  readonly message: M;
  readonly finishReason:
    | "stop"
    | "length"
    | "tool-calls"
    | "error"
    | "aborted"
    | "other";
}

function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], data: match[2] };
}

async function resolveImageContent(
  url: string,
  mediaType: string,
  signal?: AbortSignal,
): Promise<ImageContent | null> {
  const inline = parseDataUrl(url);
  if (inline) {
    return {
      type: "image",
      mimeType: inline.mimeType || mediaType,
      data: inline.data,
    };
  }
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      type: "image",
      mimeType:
        mediaType || response.headers.get("content-type") || "image/png",
      data: buffer.toString("base64"),
    };
  } catch {
    return null;
  }
}

export async function uiMessageToPiUserInput(
  message: UIMessage,
  signal?: AbortSignal,
): Promise<UserInput> {
  const blocks: Array<TextContent | ImageContent> = [];
  for (const part of message.parts) {
    if (part.type === "text" && part.text) {
      blocks.push({ type: "text", text: part.text });
    } else if (
      part.type === "file" &&
      typeof part.mediaType === "string" &&
      part.mediaType.startsWith("image/")
    ) {
      const image = await resolveImageContent(part.url, part.mediaType, signal);
      if (image) blocks.push(image);
    }
  }
  if (blocks.length === 0) return "";
  const firstBlock = blocks[0];
  if (blocks.length === 1 && firstBlock?.type === "text") {
    return firstBlock.text;
  }
  return blocks;
}

function extractToolParts(message: UIMessage): Array<{
  toolCallId: string;
  toolName: string;
  input: JsonObject;
  state: string;
  output?: unknown;
  errorText?: string;
}> {
  const out: Array<{
    toolCallId: string;
    toolName: string;
    input: JsonObject;
    state: string;
    output?: unknown;
    errorText?: string;
  }> = [];
  for (const part of message.parts) {
    if (isToolUIPart(part)) {
      out.push({
        toolCallId: part.toolCallId,
        toolName: getToolName(part),
        input:
          part.input &&
          typeof part.input === "object" &&
          !Array.isArray(part.input)
            ? (JSON.parse(JSON.stringify(part.input)) as JsonObject)
            : {},
        state: part.state ?? "output-available",
        output: part.output,
        errorText: part.errorText,
      });
    }
  }
  return out;
}

function parseToolResultDetails(result: ToolResultMessage): unknown {
  if (result.details !== undefined) {
    return result.details;
  }
  const firstText = result.content.find(
    (item): item is TextContent => item.type === "text",
  )?.text;
  if (firstText === undefined) return undefined;
  try {
    return JSON.parse(firstText);
  } catch {
    return firstText;
  }
}

function extractErrorText(
  result: ToolResultMessage,
  entry: EntryRecord,
): string {
  const data = entry.data as
    | { diagnostics?: Array<{ message?: string; code?: string }> }
    | undefined;
  const diag = data?.diagnostics?.find((d) => d.message || d.code);
  if (diag?.code === "interrupted") return "TOOL_OUTCOME_UNKNOWN";
  if (diag?.message) return diag.message;
  const firstText = result.content.find(
    (item): item is TextContent => item.type === "text",
  )?.text;
  return firstText || "TOOL_FAILED";
}

/** Project Pi Durable entries and live state of a run into a host UIMessage. */
export function projectDurableRunToUIMessage<M extends UIMessage>(
  baseMessage: M,
  entries: readonly EntryRecord[],
  minEntryId: number,
  live: LiveState | undefined,
): { message: M; stopReason?: AssistantMessage["stopReason"] } {
  const parts: UIMessagePart[] = [];
  const toolIndexByCallId = new Map<string, number>();
  let lastStopReason: AssistantMessage["stopReason"] | undefined;

  const upsertToolPart = (part: UIMessagePart & { type: "dynamic-tool" }) => {
    const existingIdx = toolIndexByCallId.get(part.toolCallId);
    if (existingIdx !== undefined) {
      parts[existingIdx] = part;
    } else {
      toolIndexByCallId.set(part.toolCallId, parts.length);
      parts.push(part);
    }
  };

  // Seed any pre-existing tool parts from baseMessage (e.g. from durable.restore())
  for (const existing of baseMessage.parts) {
    if (existing.type === "dynamic-tool") {
      upsertToolPart({ ...existing });
    }
  }

  for (const entry of entries) {
    if (entry.id <= minEntryId) continue;
    if (entry.kind === AssistantEntry.kind) {
      const msg = entry.model?.[0] as AssistantMessage | undefined;
      if (!msg || msg.role !== "assistant") continue;
      if (msg.stopReason === "aborted" || msg.stopReason === "error") {
        lastStopReason = msg.stopReason;
        continue;
      }
      lastStopReason = msg.stopReason;
      for (const block of msg.content) {
        if (block.type === "thinking" && block.thinking) {
          parts.push({ type: "reasoning", text: block.thinking });
        } else if (block.type === "text" && block.text) {
          parts.push({ type: "text", text: block.text });
        } else if (block.type === "toolCall") {
          const existingIdx = toolIndexByCallId.get(block.id);
          const existingPart =
            existingIdx !== undefined ? parts[existingIdx] : undefined;
          if (
            existingPart?.type === "dynamic-tool" &&
            (existingPart.state === "output-available" ||
              existingPart.state === "output-error")
          ) {
            continue;
          }
          upsertToolPart({
            type: "dynamic-tool",
            toolName: block.name,
            toolCallId: block.id,
            state: "input-available",
            input: block.arguments,
          });
        }
      }
    } else if (entry.kind === ToolResultEntry.kind) {
      const res = entry.model?.[0] as ToolResultMessage | undefined;
      if (!res || res.role !== "toolResult") continue;
      const existingIdx = toolIndexByCallId.get(res.toolCallId);
      const existingInput =
        existingIdx !== undefined && parts[existingIdx]?.type === "dynamic-tool"
          ? (parts[existingIdx] as { input?: unknown }).input
          : {};
      if (res.isError) {
        upsertToolPart({
          type: "dynamic-tool",
          toolName: res.toolName,
          toolCallId: res.toolCallId,
          state: "output-error",
          input: existingInput,
          errorText: extractErrorText(res, entry),
        });
      } else {
        upsertToolPart({
          type: "dynamic-tool",
          toolName: res.toolName,
          toolCallId: res.toolCallId,
          state: "output-available",
          input: existingInput,
          output: parseToolResultDetails(res),
        });
      }
    }
  }

  const partial = live?.generation?.message as AssistantMessage | undefined;
  if (partial && partial.role === "assistant") {
    for (const block of partial.content ?? []) {
      if (block.type === "thinking" && block.thinking) {
        parts.push({ type: "reasoning", text: block.thinking });
      } else if (block.type === "text" && block.text) {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "toolCall") {
        if (!toolIndexByCallId.has(block.id)) {
          upsertToolPart({
            type: "dynamic-tool",
            toolName: block.name,
            toolCallId: block.id,
            state: "input-streaming",
            input: block.arguments,
          });
        }
      }
    }
  }

  return {
    message: {
      ...baseMessage,
      parts: parts as M["parts"],
    },
    stopReason: lastStopReason,
  };
}

function resolveToolPolicy(
  policies: DurableChatOptions["toolPolicies"],
  name: string,
): "safe" | "unsafe" {
  if (!policies) return "unsafe";
  if (policies instanceof Map) {
    return policies.get(name) ?? "unsafe";
  }
  return (policies as Record<string, "safe" | "unsafe">)[name] ?? "unsafe";
}

export function toPiDurableTool(
  name: string,
  chatTool: ChatTool,
  options?: {
    replay?: "safe" | "unsafe";
    abortSignal?: AbortSignal;
  },
): ToolRegistration<Record<string, unknown>, JsonValue> {
  const parameters = zodToJsonSchema(chatTool.inputSchema);
  return defineTool({
    name,
    description: chatTool.description,
    parameters:
      parameters.type === "object"
        ? parameters
        : { type: "object", properties: {}, additionalProperties: true },
    replay: options?.replay ?? "unsafe",
    executionMode: "sequential",
    prepareArguments: (rawArgs: unknown) => {
      const parsed = chatTool.inputSchema.parse(rawArgs ?? {});
      return JSON.parse(JSON.stringify(parsed ?? {})) as JsonObject;
    },
    execute: async (args, api, context): Promise<ToolExecutionResult> => {
      if (!chatTool.execute) {
        return {
          output: [{ type: "text", text: "null" }],
          details: null,
        };
      }
      const parsed = chatTool.inputSchema.parse(args ?? {});
      const signal =
        options?.abortSignal && context.abortSignal
          ? AbortSignal.any([options.abortSignal, context.abortSignal])
          : (options?.abortSignal ?? context.abortSignal);
      const output = await chatTool.execute(parsed, {
        toolCallId: api.callId,
        abortSignal: signal,
      });
      const jsonDetails = JSON.parse(
        JSON.stringify(output ?? null),
      ) as JsonValue;
      const isPending =
        !!output &&
        typeof output === "object" &&
        "pending" in output &&
        (output as { pending?: unknown }).pending === true;
      await api.details(jsonDetails, context);
      return {
        output: [
          {
            type: "text",
            text:
              typeof output === "string"
                ? output
                : JSON.stringify(output ?? null),
          },
        ],
        details: jsonDetails,
        ...(isPending ? { control: { terminate: true } } : {}),
      };
    },
  });
}

/**
 * Execute a durable chat turn through @earendil-works/pi-durable over the supplied Storage backend.
 * Host owns authorization, persisted history, attachments, and billing.
 */
export async function runDurableChat<M extends UIMessage = UIMessage>(
  options: DurableChatOptions<M>,
): Promise<DurableChatResult<M>> {
  if (
    !options.model ||
    typeof options.model !== "object" ||
    !options.model.models ||
    !options.model.modelRef
  ) {
    throw new Error(
      "Construct an explicit Pi chat model adapter before starting a run",
    );
  }
  const limits = z
    .object({
      maxSteps: z.number().int().min(1).max(100).default(10),
      maxOutputTokens: z.number().int().min(1).max(200_000).default(4096),
    })
    .parse(options);

  const context = options.abortSignal
    ? withAbortSignal(options.abortSignal, BACKGROUND_CONTEXT)
    : BACKGROUND_CONTEXT;

  let capturedError: unknown;

  const recordFatalError = (error: unknown) => {
    if (capturedError === undefined) {
      capturedError = error;
    }
  };

  const piTools = Object.entries(options.tools ?? {}).map(([name, chatTool]) =>
    toPiDurableTool(name, chatTool, {
      replay: resolveToolPolicy(options.toolPolicies, name),
      abortSignal: options.abortSignal,
    }),
  );

  // Wrap tool execute to capture fatal host errors (such as AgentExecutionError)
  const wrappedPiTools = piTools.map((tool) => ({
    ...tool,
    execute: async (
      args: Record<string, unknown>,
      api: Parameters<typeof tool.execute>[1],
      toolContext: Parameters<typeof tool.execute>[2],
    ) => {
      try {
        return await tool.execute(args, api, toolContext);
      } catch (error) {
        recordFatalError(error);
        throw error;
      }
    },
  }));

  const registry = createRegistry();
  registry.install(
    defineExtension({
      name: "velobase-chat",
      tools: wrappedPiTools,
      hooks: [
        hook(GenerationTask, {
          beforeRequest: async () => {
            try {
              await options.onStepStart?.();
              return undefined;
            } catch (error) {
              recordFatalError(error);
              throw error;
            }
          },
          afterResponse: async (message) => {
            if (
              message.stopReason === "error" ||
              message.stopReason === "aborted"
            ) {
              return;
            }
            try {
              await options.onStepFinish?.({
                usage: {
                  inputTokens: message.usage?.input ?? 0,
                  outputTokens: message.usage?.output ?? 0,
                },
              });
            } catch (error) {
              recordFatalError(error);
              throw error;
            }
          },
        }),
      ],
    }),
  );

  const harness = await Harness.open(
    options.storage,
    {
      models: options.model.models,
      registry,
      settings: {
        toolExecution: "sequential",
        stream: {
          maxRetries: 0,
        },
        retry: {
          enabled: false,
          maxRetries: 0,
          baseDelayMs: 1_000,
        },
        compaction: {
          enabled: false,
        },
        progress: {
          partialIntervalMs: 100,
          outputIntervalMs: 100,
          persistWithinMs: 250,
        },
      },
      onReport: (report) => {
        if (
          report.kind === "extension_error" ||
          report.kind === "task_faulted" ||
          report.kind === "storage_failed"
        ) {
          recordFatalError(report.error);
        }
      },
    },
    BACKGROUND_CONTEXT,
  );

  let abortListener: (() => void) | undefined;
  try {
    const root = await harness.root(BACKGROUND_CONTEXT, {
      agent: {
        model: options.model.modelRef,
        instructions: options.system,
        maxTurns: limits.maxSteps,
      },
    });

    if (options.abortSignal) {
      abortListener = () => {
        void root.abort(BACKGROUND_CONTEXT).catch(() => undefined);
      };
      if (options.abortSignal.aborted) {
        abortListener();
      } else {
        options.abortSignal.addEventListener("abort", abortListener, {
          once: true,
        });
      }
    }

    const trailingAssistant =
      options.messages.at(-1)?.role === "assistant"
        ? options.messages.at(-1)!
        : ({
            id: options.assistantMessageId,
            role: "assistant",
            parts: [],
          } as unknown as M);

    const nonEmptyMessages = options.messages.filter(
      (msg, idx) =>
        !(
          idx === options.messages.length - 1 &&
          msg.role === "assistant" &&
          msg.parts.length === 0
        ),
    );
    let lastUserIdx = -1;
    for (let i = nonEmptyMessages.length - 1; i >= 0; i--) {
      if (nonEmptyMessages[i]?.role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) {
      throw new Error("Conversation has no user message to answer");
    }

    const priorMessages = nonEmptyMessages.slice(0, lastUserIdx);
    const currentUserMessage = nonEmptyMessages[lastUserIdx]!;
    const restoredToolParts = extractToolParts(trailingAssistant).filter(
      (part) =>
        part.state === "output-available" || part.state === "output-error",
    );

    const existingEntriesPage = await root.entries(
      { order: "ascending" },
      1000,
      undefined,
      BACKGROUND_CONTEXT,
    );

    let minRunEntryId = 0;
    let submission;

    if (existingEntriesPage.items.length === 0) {
      // Seed prior branch history into the Pi Durable root conversation
      if (priorMessages.length > 0) {
        const preparedHistory: Array<
          | { kind: "user"; content: UserInput; timestamp: number }
          | {
              kind: "assistant";
              message: AssistantMessage;
              toolResults: ToolResultMessage[];
            }
        > = [];
        for (const msg of priorMessages) {
          const ts = Date.now();
          if (msg.role === "user") {
            const content = await uiMessageToPiUserInput(
              msg,
              options.abortSignal,
            );
            preparedHistory.push({ kind: "user", content, timestamp: ts });
          } else if (msg.role === "assistant") {
            const content: Array<TextContent | ToolCall> = [];
            const toolResults: ToolResultMessage[] = [];
            for (const part of msg.parts) {
              if (part.type === "text" && part.text) {
                content.push({ type: "text", text: part.text });
              } else if (isToolUIPart(part)) {
                const toolName = getToolName(part);
                const args =
                  part.input &&
                  typeof part.input === "object" &&
                  !Array.isArray(part.input)
                    ? (JSON.parse(JSON.stringify(part.input)) as JsonObject)
                    : {};
                content.push({
                  type: "toolCall",
                  id: part.toolCallId,
                  name: toolName,
                  arguments: args,
                });
                if (
                  part.state === "output-available" ||
                  part.state === "output-error"
                ) {
                  const textOut =
                    part.state === "output-error"
                      ? (part.errorText ?? "Tool error")
                      : typeof part.output === "string"
                        ? part.output
                        : JSON.stringify(part.output ?? null);
                  toolResults.push({
                    role: "toolResult",
                    toolCallId: part.toolCallId,
                    toolName,
                    content: [{ type: "text", text: textOut }],
                    details: JSON.parse(
                      JSON.stringify(part.output ?? null),
                    ) as JsonValue,
                    isError: part.state === "output-error",
                    timestamp: ts,
                  });
                }
              }
            }
            if (content.length > 0) {
              preparedHistory.push({
                kind: "assistant",
                message: {
                  role: "assistant",
                  content,
                  api: "openai-completions",
                  provider: options.model.provider,
                  model: options.model.modelId,
                  usage: emptyUsage(),
                  stopReason: toolResults.length > 0 ? "toolUse" : "stop",
                  timestamp: ts,
                },
                toolResults,
              });
            }
          }
        }

        if (preparedHistory.length > 0) {
          await root.commit(async (tx) => {
            for (const item of preparedHistory) {
              if (item.kind === "user") {
                const entry = await tx.appendEntry(UserEntry, root.id, {
                  model: [
                    {
                      role: "user",
                      content: item.content,
                      timestamp: item.timestamp,
                    } satisfies UserMessage,
                  ],
                });
                minRunEntryId = entry.id;
              } else {
                const aEntry = await tx.appendEntry(AssistantEntry, root.id, {
                  model: [item.message],
                });
                minRunEntryId = aEntry.id;
                for (const tr of item.toolResults) {
                  const tEntry = await tx.appendEntry(
                    ToolResultEntry,
                    root.id,
                    {
                      model: [tr],
                      data: { diagnostics: [] },
                    },
                  );
                  minRunEntryId = tEntry.id;
                }
              }
            }
          }, BACKGROUND_CONTEXT);
        }
      }

      const userInput = await uiMessageToPiUserInput(
        currentUserMessage,
        options.abortSignal,
      );

      if (restoredToolParts.length > 0) {
        // Seed the user message and restored tool calls/results, then continue
        const ts = Date.now();
        await root.commit(async (tx) => {
          const uEntry = await tx.appendEntry(UserEntry, root.id, {
            model: [
              {
                role: "user",
                content: userInput,
                timestamp: ts,
              } satisfies UserMessage,
            ],
          });
          minRunEntryId = uEntry.id;
          await tx.appendEntry(AssistantEntry, root.id, {
            model: [
              {
                role: "assistant",
                content: restoredToolParts.map((tp) => ({
                  type: "toolCall" as const,
                  id: tp.toolCallId,
                  name: tp.toolName,
                  arguments: tp.input,
                })),
                api: "openai-completions",
                provider: options.model.provider,
                model: options.model.modelId,
                usage: emptyUsage(),
                stopReason: "toolUse",
                timestamp: ts,
              },
            ],
          });
          for (const tp of restoredToolParts) {
            const textOut =
              tp.state === "output-error"
                ? (tp.errorText ?? "Tool error")
                : typeof tp.output === "string"
                  ? tp.output
                  : JSON.stringify(tp.output ?? null);
            await tx.appendEntry(ToolResultEntry, root.id, {
              model: [
                {
                  role: "toolResult",
                  toolCallId: tp.toolCallId,
                  toolName: tp.toolName,
                  content: [{ type: "text", text: textOut }],
                  details: JSON.parse(
                    JSON.stringify(tp.output ?? null),
                  ) as JsonValue,
                  isError: tp.state === "output-error",
                  timestamp: ts,
                },
              ],
              data: { diagnostics: [] },
            });
          }
        }, BACKGROUND_CONTEXT);

        submission = await root.submit(
          {
            type: "continue",
            requestId: `${options.requestId}:continue`,
          },
          context,
        );
      } else {
        submission = await root.submit(
          {
            type: "input",
            content: userInput,
            requestId: options.requestId,
          },
          context,
        );
      }
    } else {
      // Existing Pi Durable session in storage: find the user entry of this run
      const userEntries = existingEntriesPage.items.filter(
        (e) => e.kind === UserEntry.kind,
      );
      const runUserEntry = userEntries.at(-1);
      if (runUserEntry) {
        minRunEntryId = runUserEntry.id;
      }

      // Reconcile any updated tool results from durable.restore() via ContextEdit
      if (restoredToolParts.length > 0) {
        const toolResultEntries = existingEntriesPage.items.filter(
          (e) => e.id > minRunEntryId && e.kind === ToolResultEntry.kind,
        );
        const edits: Array<{
          target: EntryId;
          action: "replace";
          messages: readonly Message[];
        }> = [];
        for (const tEntry of toolResultEntries) {
          const msg = tEntry.model?.[0] as ToolResultMessage | undefined;
          if (!msg || msg.role !== "toolResult") continue;
          const restored = restoredToolParts.find(
            (tp) => tp.toolCallId === msg.toolCallId,
          );
          if (!restored) continue;
          const textOut =
            restored.state === "output-error"
              ? (restored.errorText ?? "Tool error")
              : typeof restored.output === "string"
                ? restored.output
                : JSON.stringify(restored.output ?? null);
          edits.push({
            target: tEntry.id,
            action: "replace",
            messages: [
              {
                role: "toolResult",
                toolCallId: restored.toolCallId,
                toolName: restored.toolName,
                content: [{ type: "text", text: textOut }],
                details: JSON.parse(
                  JSON.stringify(restored.output ?? null),
                ) as JsonValue,
                isError: restored.state === "output-error",
                timestamp: Date.now(),
              },
            ],
          });
        }
        if (edits.length > 0) {
          await root.commit(async (tx) => {
            await tx.appendEntry(root.id, {
              kind: "app.tool-reconcile",
              edits,
            });
          }, BACKGROUND_CONTEXT);
        }
      }

      const existingSub = await root.commit(
        (tx) => tx.submissionByRequest(root.id, options.requestId),
        BACKGROUND_CONTEXT,
      );
      if (
        existingSub &&
        (existingSub.status === "queued" || existingSub.status === "placed")
      ) {
        submission = (await harness.submission(
          existingSub.id,
          BACKGROUND_CONTEXT,
        ))!;
        harness.resume();
      } else {
        submission = await root.submit(
          {
            type: "continue",
            requestId: `${options.requestId}:continue:${Date.now()}`,
          },
          context,
        );
      }
    }

    // Stream progress updates while the submission is running
    let lastProgressAt = 0;
    let progressChain = Promise.resolve();
    const emitProgress = async (force = false) => {
      if (!options.onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < 250) return;
      lastProgressAt = now;
      const [page, live] = await Promise.all([
        root.entries(
          { minEntryId: minRunEntryId as EntryId, order: "ascending" },
          500,
          undefined,
          BACKGROUND_CONTEXT,
        ),
        harness.snapshot(LiveDoc, root.id, BACKGROUND_CONTEXT),
      ]);
      const projected = projectDurableRunToUIMessage(
        trailingAssistant,
        page.items,
        minRunEntryId,
        live,
      );
      await options.onProgress(projected.message);
    };

    const commitObs = harness.observeCommits({
      advance: () => {
        progressChain = progressChain
          .then(() => emitProgress(false))
          .catch((err) => {
            recordFatalError(err);
          });
      },
      end: () => undefined,
    });

    let settled;
    try {
      settled = await submission.wait(context);
    } finally {
      commitObs.detach();
      await progressChain;
    }

    if (capturedError !== undefined) {
      throw capturedError;
    }

    const [finalPage, finalLive] = await Promise.all([
      root.entries(
        { minEntryId: minRunEntryId as EntryId, order: "ascending" },
        500,
        undefined,
        BACKGROUND_CONTEXT,
      ),
      harness.snapshot(LiveDoc, root.id, BACKGROUND_CONTEXT),
    ]);

    const finalProjected = projectDurableRunToUIMessage(
      trailingAssistant,
      finalPage.items,
      minRunEntryId,
      finalLive,
    );
    await options.onProgress?.(finalProjected.message);

    if (capturedError !== undefined) {
      throw capturedError;
    }

    if (settled.status === "unanswered") {
      if (
        settled.reason === "turn_limit" ||
        finalLive?.runFailure?.reason === "turn_limit"
      ) {
        return {
          message: finalProjected.message,
          finishReason: "tool-calls",
        };
      }
      if (settled.reason === "aborted") {
        return {
          message: finalProjected.message,
          finishReason: "aborted",
        };
      }
      return {
        message: finalProjected.message,
        finishReason: "error",
      };
    }

    if (finalProjected.stopReason === "length") {
      return {
        message: finalProjected.message,
        finishReason: "length",
      };
    }

    return {
      message: finalProjected.message,
      finishReason: "stop",
    };
  } finally {
    if (abortListener && options.abortSignal) {
      options.abortSignal.removeEventListener("abort", abortListener);
    }
    await harness.close(BACKGROUND_CONTEXT).catch(() => undefined);
  }
}
