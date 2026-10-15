"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  variant?: "default" | "positive" | "negative";
  className?: string;
}

export const MessageActionButton = forwardRef<
  HTMLButtonElement,
  MessageActionButtonProps
>(function MessageActionButton(
  { icon, label, onClick, disabled, active, variant = "default", className },
  ref
) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
              // Base styles
              "h-7 w-7 rounded-full flex items-center justify-center",
              "transition-all duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              
              // Default variant
              variant === "default" && [
                "text-muted-foreground/85",
                "hover:bg-muted/40 hover:text-muted-foreground",
                "active:scale-[0.98] active:bg-muted/60",
                active && "bg-muted/50 text-foreground",
              ],
              
              // Positive variant (thumbs up)
              variant === "positive" && [
                active
                  ? "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400"
                  : "text-muted-foreground/85 hover:bg-muted/40 hover:text-muted-foreground",
                "active:scale-[0.98]",
              ],
              
              // Negative variant (thumbs down)
              variant === "negative" && [
                active
                  ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                  : "text-muted-foreground/85 hover:bg-muted/40 hover:text-muted-foreground",
                "active:scale-[0.98]",
              ],
              
              // Disabled state
              disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
              
              className
            )}
            aria-label={label}
          >
            <span className="flex items-center justify-center w-4 h-4">
              {icon}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

