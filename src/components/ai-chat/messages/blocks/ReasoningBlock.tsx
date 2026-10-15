"use client";

import React, { useState, memo } from "react";
import { Sparkles } from "lucide-react";

interface ReasoningBlockProps {
  content: string;
  summary?: string;
  isStreaming?: boolean;
}

function ReasoningBlockImpl({ content, summary, isStreaming }: ReasoningBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full min-w-0 my-2 rounded-lg border border-border/40 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
      {/* Header - clickable to toggle */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <span className="text-xs text-blue-700 dark:text-blue-300 tracking-wide font-medium">
          {isStreaming ? "Thinking..." : "Thinking"}
        </span>
        {summary && !isOpen && (
          <span className="text-xs text-muted-foreground ml-2 truncate">
            {summary}
          </span>
        )}
      </div>

      {/* Content area - only shown when expanded */}
      {isOpen && (
        <div className="max-h-60 overflow-y-auto border-t border-blue-200/50 dark:border-blue-800/50 px-3 py-2.5 bg-white/50 dark:bg-black/20">
          <pre
            className="text-[13.5px] leading-[1.6] text-foreground/80 font-mono"
            style={{
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "normal",
            }}
          >
            {content || (
              <span className="text-xs italic text-muted-foreground/60">
                No reasoning available
              </span>
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

export const ReasoningBlock = memo(ReasoningBlockImpl);

