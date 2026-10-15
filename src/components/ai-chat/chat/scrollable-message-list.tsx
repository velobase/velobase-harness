"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { UserMessage } from "@/components/ai-chat/messages/user-message";
import { AssistantMessage } from "@/components/ai-chat/messages/assistant-message";
import type { ChatUIMessage } from "@/types/ai-chat/message";

interface ScrollableMessageListProps {
  messages: ChatUIMessage[];
  conversationId?: string;
  isStreaming?: boolean;
  onAtBottomChange?: (atBottom: boolean) => void;
  onRegenerate?: (interactionId: string) => void | Promise<void>;
  onEdit?: (messageId: string, newContent: string) => void;
  isReadOnly?: boolean;
}

export type ScrollableMessageListHandle = {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

/**
 * Scrollable Message List - ChatGPT style
 * 
 * Design principles (from forgica-ai):
 * 1. "Clear Canvas": User message is positioned flush to the top of viewport when sent
 * 2. "No Auto-Scroll": AI response fills the canvas below, user manually scrolls if content overflows
 * 3. "User Sovereignty": System only presents content, user controls reading pace
 * 
 * Pure UI component - no chat logic, only scrolling behavior
 */
export const ScrollableMessageList = React.forwardRef<
  ScrollableMessageListHandle,
  ScrollableMessageListProps
>(function ScrollableMessageList({ messages, conversationId, isStreaming, onAtBottomChange, onRegenerate, onEdit, isReadOnly = false }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const lastAssistantWrapperRef = useRef<HTMLDivElement>(null);
  const lastUserContentStableRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollAfterAssistantRef = useRef(false);
  const [lastAssistantMinHeight, setLastAssistantMinHeight] = useState<number | null>(null);

  // Imperative API
  React.useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: (behavior: ScrollBehavior = "smooth") => {
        if (containerRef.current) {
          containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior });
        }
      },
    }),
    []
  );

  // Measure container height for AI message canvas
  useEffect(() => {
    if (!containerRef.current) return;

    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Track scroll position for atBottom detection
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 64;
    onAtBottomChange?.(atBottom);
  }, [onAtBottomChange]);

  // Keep a stable reference to the last user content element
  useEffect(() => {
    if (lastUserMessageRef.current) {
      lastUserContentStableRef.current = lastUserMessageRef.current;
    }
  }, [messages, containerHeight]);

  // ChatGPT behavior: scroll user message to top when new message arrives
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    const isNewUserMessage =
      lastMessage?.role === "user" && messages.length > prevMessageCountRef.current;
    
    if (isNewUserMessage) {
      pendingScrollAfterAssistantRef.current = true;
    }

    // Scroll when placeholder wrapper appears
    if (
      pendingScrollAfterAssistantRef.current &&
      containerRef.current &&
      lastAssistantWrapperRef.current &&
      lastUserContentStableRef.current
    ) {
      const container = containerRef.current;
      const userEl = lastUserContentStableRef.current;
      const assistantWrapper = lastAssistantWrapperRef.current;

      const assistantStyles = getComputedStyle(assistantWrapper);
      const assistantPaddingTop = parseFloat(assistantStyles.paddingTop || "0") || 0;

      const userRect = userEl.getBoundingClientRect();
      const assistantRect = assistantWrapper.getBoundingClientRect();

      const deltaToAssistantContentTop = assistantRect.top + assistantPaddingTop - userRect.top;
      const minHeightPx = Math.max(
        Math.round((containerHeight || container.clientHeight) - deltaToAssistantContentTop),
        0
      );
      setLastAssistantMinHeight(minHeightPx);

      requestAnimationFrame(() => {
        container.scrollTop = userEl.offsetTop;
      });

      pendingScrollAfterAssistantRef.current = false;
    }

    const isNewAssistantMessage =
      lastMessage?.role === "assistant" && messages.length > prevMessageCountRef.current;
    
    if (
      isNewAssistantMessage &&
      !pendingScrollAfterAssistantRef.current &&
      containerRef.current &&
      lastAssistantWrapperRef.current &&
      lastUserContentStableRef.current
    ) {
      const container = containerRef.current;
      const userEl = lastUserContentStableRef.current;
      const assistantWrapper = lastAssistantWrapperRef.current;

      const assistantStyles = getComputedStyle(assistantWrapper);
      const assistantPaddingTop = parseFloat(assistantStyles.paddingTop || "0") || 0;

      const userRect = userEl.getBoundingClientRect();
      const assistantRect = assistantWrapper.getBoundingClientRect();

      const deltaToAssistantContentTop = assistantRect.top + assistantPaddingTop - userRect.top;
      const minHeightPx = Math.max(
        Math.round((containerHeight || container.clientHeight) - deltaToAssistantContentTop),
        0
      );
      setLastAssistantMinHeight(minHeightPx);

      requestAnimationFrame(() => {
        container.scrollTop = userEl.offsetTop;
      });

      pendingScrollAfterAssistantRef.current = false;
    }

    prevMessageCountRef.current = messages.length;
  }, [messages, containerHeight]);

  const renderMessage = useCallback(
    (message: ChatUIMessage, index: number) => {
      const isLastMessage = index === messages.length - 1;
      const isLastUserMessage = message.role === "user" && isLastMessage;
      const isLastAssistantMessage = message.role === "assistant" && isLastMessage;

      if (message.role === "user") {
        return (
          <div key={message.id} className="w-full">
            <div className="mx-auto max-w-3xl px-3 sm:px-4 md:px-6 py-2 md:py-3">
              <div ref={isLastUserMessage ? lastUserMessageRef : undefined}>
                <UserMessage message={message} onEdit={onEdit} isReadOnly={isReadOnly} />
              </div>
            </div>
          </div>
        );
      }

      return (
        <div
          key={message.id}
          className="w-full"
          ref={isLastAssistantMessage ? lastAssistantWrapperRef : undefined}
          style={
            isLastAssistantMessage && lastAssistantMinHeight != null
              ? { minHeight: `${lastAssistantMinHeight}px` }
              : undefined
          }
        >
          <div className="mx-auto max-w-3xl px-3 sm:px-4 md:px-6 py-2 md:py-3">
            <AssistantMessage
              message={message}
              conversationId={conversationId}
              isStreaming={Boolean(isStreaming && isLastMessage)}
              isLastMessage={isLastMessage}
              onRegenerate={onRegenerate}
            />
          </div>
        </div>
      );
    },
    [lastAssistantMinHeight, isStreaming, messages.length, conversationId, onRegenerate, onEdit, isReadOnly]
  );

  return (
    <div className="flex h-full flex-1 min-w-0 overflow-hidden">
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-auto overflow-x-hidden"
        onScroll={handleScroll}
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="flex flex-col min-h-full">
            {/* Messages */}
            {messages.map((message, index) => renderMessage(message, index))}

            {/* Placeholder wrapper when the last message is user: reserves AI canvas immediately */}
            {messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
              <div
                className="w-full"
                ref={lastAssistantWrapperRef}
                style={
                  lastAssistantMinHeight != null
                    ? { minHeight: `${lastAssistantMinHeight}px` }
                    : undefined
                }
              >
                <div className="mx-auto max-w-3xl px-3 sm:px-4 md:px-6 py-2 md:py-3">
                  {isStreaming && <DocumentProcessingIndicator message={messages[messages.length - 1]!} />}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
});

/**
 * Document processing indicator component
 */
function DocumentProcessingIndicator({ message }: { message: ChatUIMessage }) {
  const hasDocument = useMemo(() => {
    const fileParts = message.parts.filter(part => {
      if (typeof part === 'object' && part !== null && 'type' in part && part.type === 'file') {
        const mediaType = 'mediaType' in part ? String(part.mediaType) : '';
        // Check for document types (not images)
        return mediaType === 'application/pdf' ||
               mediaType.includes('word') ||
               mediaType.includes('excel') ||
               mediaType.includes('document') ||
               mediaType.includes('spreadsheet');
      }
      return false;
    });
    
    return fileParts.length > 0;
  }, [message.parts]);

  if (!hasDocument) {
    return <div className="text-sm text-muted-foreground">思考中...</div>;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span>正在处理文档，请稍候...</span>
    </div>
  );
}

