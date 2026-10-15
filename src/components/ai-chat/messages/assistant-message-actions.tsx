"use client";

import React, { useState, useCallback } from "react";
import { Copy, ThumbsUp, ThumbsDown, RefreshCw, MoreHorizontal, GitBranch, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageActionButton } from "@/components/ai-chat/messages/message-action-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface AssistantMessageActionsProps {
  messageId: string;
  content: string;
  conversationId: string;
  isLastMessage?: boolean;
  isStreaming?: boolean;
  onRegenerate?: (interactionId: string) => void | Promise<void>;
  onBranch?: () => void;
  className?: string;
}

export function AssistantMessageActions({
  messageId: _messageId,
  content,
  conversationId: _conversationId,
  isLastMessage,
  isStreaming,
  onRegenerate,
  onBranch,
  className,
}: AssistantMessageActionsProps) {
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy");
    }
  }, [content]);

  const handleFeedback = useCallback((type: "positive" | "negative") => {
    setFeedback(prev => prev === type ? null : type);
    // TODO: Send feedback to backend
    toast.success(type === "positive" ? "Thanks for the feedback!" : "Feedback noted");
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (isRegenerating) return;
    
    setIsRegenerating(true);
    try {
      if (onRegenerate) {
        await onRegenerate(_messageId);
      } else {
        toast.info("Regenerate not implemented yet");
      }
    } catch (error) {
      console.error("Failed to regenerate:", error);
      toast.error("Failed to regenerate message");
    } finally {
      setIsRegenerating(false);
    }
  }, [onRegenerate, _messageId, isRegenerating]);

  const handleBranch = useCallback(() => {
    if (onBranch) {
      onBranch();
    } else {
      // TODO: Implement branch logic
      toast.info("Branch not implemented yet");
    }
  }, [onBranch]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 mt-2",
        className
      )}
    >
      {/* Copy button */}
      <MessageActionButton
        icon={copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        label="Copy"
        onClick={handleCopy}
      />

      {/* Thumbs up */}
      <MessageActionButton
        icon={<ThumbsUp className="w-4 h-4" />}
        label="Good response"
        onClick={() => handleFeedback("positive")}
        active={feedback === "positive"}
        variant="positive"
        className="hidden sm:flex"
      />

      {/* Thumbs down */}
      <MessageActionButton
        icon={<ThumbsDown className="w-4 h-4" />}
        label="Bad response"
        onClick={() => handleFeedback("negative")}
        active={feedback === "negative"}
        variant="negative"
        className="hidden sm:flex"
      />

      {/* Regenerate - only for last message */}
      {isLastMessage && (
        <MessageActionButton
          icon={<RefreshCw className={cn("w-4 h-4", isStreaming && "animate-spin")} />}
          label="Regenerate"
          onClick={handleRegenerate}
          disabled={isStreaming}
          className="hidden md:flex"
        />
      )}

      {/* More menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center",
              "text-muted-foreground/85 transition-all duration-150 ease-out",
              "hover:bg-muted/40 hover:text-muted-foreground",
              "active:scale-[0.98] active:bg-muted/60",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
            aria-label="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-48">
          {/* Mobile-only: feedback actions */}
          <div className="sm:hidden">
            <DropdownMenuItem onClick={() => handleFeedback("positive")}>
              <ThumbsUp className="w-4 h-4 mr-2" />
              Good response
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleFeedback("negative")}>
              <ThumbsDown className="w-4 h-4 mr-2" />
              Bad response
            </DropdownMenuItem>
            {isLastMessage && (
              <DropdownMenuItem onClick={handleRegenerate} disabled={isStreaming}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="sm:hidden" />
          </div>

          {/* Branch */}
          <DropdownMenuItem onClick={handleBranch}>
            <GitBranch className="w-4 h-4 mr-2" />
            Branch in new chat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

