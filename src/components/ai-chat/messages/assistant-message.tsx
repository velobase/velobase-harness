"use client";

import React, { memo, useMemo } from "react";
import type { ChatUIMessage } from "@/types/ai-chat/message";
import { isToolUIPart, getToolName } from "ai";
import { cn } from "@/lib/utils";
import { TextBlock } from "@/components/ai-chat/messages/blocks/TextBlock";
import { ToolBlock } from "@/components/ai-chat/messages/blocks/ToolBlock";
import { ReasoningBlock } from "@/components/ai-chat/messages/blocks/ReasoningBlock";
import { getToolRenderer } from "@/components/ai-chat/messages/blocks/tools/registry";
import { AssistantMessageActions } from "@/components/ai-chat/messages/assistant-message-actions";

interface AssistantMessageProps {
  message: ChatUIMessage;
  conversationId?: string;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  onRegenerate?: (interactionId: string) => void | Promise<void>;
  className?: string;
}

function AssistantMessageImpl({
  message,
  conversationId,
  isStreaming,
  isLastMessage,
  onRegenerate,
  className,
}: AssistantMessageProps) {
  // Process parts: handle text, reasoning, and tool calls
  const processedParts = useMemo(() => {
    const result: Array<{
      key: string;
      element: React.ReactNode;
    }> = [];

    // Process each part
    message.parts.forEach((part: unknown, index: number) => {
      const typedPart = part as { type: string };
      const key = `${typedPart.type}-${index}`;

      // Text part
      if (typedPart.type === "text") {
        const textPart = part as { text: string };
        result.push({
          key,
          element: <TextBlock content={textPart.text} isStreaming={isStreaming} />,
        });
      }
      // Reasoning part
      else if (typedPart.type === "reasoning") {
        const reasoningPart = part as { text: string; summary?: string };
        result.push({
          key,
          element: (
            <ReasoningBlock
              content={reasoningPart.text}
              summary={reasoningPart.summary}
              isStreaming={isStreaming}
            />
          ),
        });
      }
      // Tool parts (use SDK helper to check and extract tool name)
      else if (isToolUIPart(part as Parameters<typeof isToolUIPart>[0])) {
        // Extract tool name using SDK helper
        const toolName = getToolName(part as Parameters<typeof getToolName>[0]);
        const toolCallId = (part as { toolCallId?: string }).toolCallId;

        // Get state and data
        const state = (part as { state?: string }).state;
        const input = "input" in (part as object) ? (part as { input: unknown }).input : undefined;
        const output =
          "output" in (part as object) ? (part as { output: unknown }).output : undefined;
        const error =
          "errorText" in (part as object) ? (part as { errorText: string }).errorText : undefined;

        const CustomRenderer = getToolRenderer(toolName);

        // Use custom renderer if available
        if (CustomRenderer) {
          result.push({
            key,
            element: (
              <CustomRenderer
                data={{
                  toolCallId: toolCallId ?? "",
                  toolName,
                  state: (state ?? "output-available") as "input-streaming" | "input-available" | "output-available" | "output-error",
                  input,
                  output,
                  error,
                }}
              />
            ),
          });
        } else {
          // Use default ToolBlock
          result.push({
            key,
            element: (
              <ToolBlock toolName={toolName} input={input} output={output} error={error} state={state} />
            ),
          });
        }
      }
    });

    return result;
  }, [message.parts, isStreaming]);

  // Extract text content for actions
  const textContent = useMemo(() => {
    return message.parts
      .filter((part: unknown) => (part as { type: string }).type === "text")
      .map((part: unknown) => {
        const textPart = part as { text: string };
        return textPart.text;
      })
      .join("\n");
  }, [message.parts]);

  // If no parts to render, show "Thinking..."
  if (processedParts.length === 0 && isStreaming) {
    return (
      <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
        <div className="text-sm italic text-muted-foreground">Thinking...</div>
      </div>
    );
  }

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      {processedParts.map(({ key, element }) => (
        <React.Fragment key={key}>{element}</React.Fragment>
      ))}

      {/* Message actions */}
      {textContent && conversationId && (
        <AssistantMessageActions
          messageId={message.id}
          conversationId={conversationId}
          content={textContent}
          isLastMessage={isLastMessage}
          isStreaming={isStreaming}
          onRegenerate={onRegenerate}
        />
      )}
    </div>
  );
}

export const AssistantMessage = memo(AssistantMessageImpl);
