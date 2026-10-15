"use client";

import React, { useState, memo } from "react";
import { ChevronDown, ChevronRight, Wrench, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface ToolBlockProps {
  toolName: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  state?: string;
}

function ToolBlockImpl({ toolName, input, output, error, state }: ToolBlockProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasResult = output !== undefined || error !== undefined;
  const isError = !!error;
  const isExecuting = state === "call" && !hasResult;

  return (
    <div className="w-full min-w-0 my-2 rounded-lg border border-border/40 bg-muted/30">
      {/* Header - clickable */}
      <div
        className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50 rounded-t-lg transition-colors"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <Wrench className="h-5 w-5 text-purple-600 flex-shrink-0" />
        <div className="flex-1 font-medium text-sm">
          {toolName}
        </div>

        {isExecuting && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
        
        {hasResult &&
          (isError ? (
            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          ) : (
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
          ))}

        {isOpen ? (
          <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
      </div>

      {/* Expandable content */}
      {isOpen && (
        <div className="border-t border-border/30 p-4 space-y-3">
          {typeof input === "object" && input !== null && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                Arguments:
              </div>
              <pre
                className="max-w-full overflow-x-auto rounded bg-muted/50 p-3 text-[13px] leading-[1.5] text-foreground font-mono"
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  wordBreak: "normal",
                }}
              >
                {JSON.stringify(input, null, 2)}
              </pre>
            </div>
          )}

          {/* Result or Error */}
          {error ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-red-700">Error:</div>
              <div
                className="max-w-full rounded bg-destructive/10 p-3 text-sm text-destructive"
                style={{
                  overflowWrap: "anywhere",
                  wordBreak: "normal",
                }}
              >
                {error}
              </div>
            </div>
          ) : output !== undefined ? (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                Result:
              </div>
              <pre
                className="max-w-full overflow-x-auto rounded bg-muted/50 p-3 text-[13px] leading-[1.5] text-foreground font-mono"
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap: "anywhere",
                  wordBreak: "normal",
                }}
              >
                {typeof output === "string"
                  ? output
                  : JSON.stringify(output, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">Executing...</div>
          )}
        </div>
      )}
    </div>
  );
}

export const ToolBlock = memo(ToolBlockImpl);

