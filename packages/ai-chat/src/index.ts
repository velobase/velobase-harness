import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";
export * from "./tools";
export type { ToolSet, UIMessage } from "ai";

export const aiChatFeature = {
  id: "ai-chat",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/admin/dialogs",
  connection: "ai",
} as const;

export interface ChatStreamOptions {
  /** Explicitly constructed model. No string fallback to a global model gateway. */
  model: Exclude<LanguageModel, string>;
  messages: UIMessage[];
  tools?: ToolSet;
  system: string;
  maxSteps?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  providerOptions?: Parameters<typeof streamText>[0]["providerOptions"];
}

/** Model/tool execution only. Host owns authorization, persisted history, attachments and billing. */
export function streamChat(options: ChatStreamOptions) {
  if (!options.model || typeof options.model !== "object")
    throw new Error(
      "Construct an explicit chat model adapter before starting a stream",
    );
  const limits = z
    .object({
      maxSteps: z.number().int().min(1).max(100).default(10),
      maxOutputTokens: z.number().int().min(1).max(200_000).default(4096),
    })
    .parse(options);
  return streamText({
    model: options.model,
    messages: convertToModelMessages(options.messages, {
      ignoreIncompleteToolCalls: true,
    }),
    tools: options.tools,
    system: options.system,
    maxOutputTokens: limits.maxOutputTokens,
    stopWhen: stepCountIs(limits.maxSteps),
    providerOptions: options.providerOptions,
    abortSignal: options.abortSignal,
    maxRetries: 0,
  });
}
