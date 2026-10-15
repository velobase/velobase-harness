"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface MessageListSkeletonProps {
  count?: number;
  className?: string;
}

export function MessageListSkeleton({ count = 3, className }: MessageListSkeletonProps) {
  return (
    <div className={cn("flex h-full flex-col overflow-y-auto", className)}>
      <div className="flex-1" />
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-4 md:px-6 space-y-8 py-8">
        {Array.from({ length: count }).map((_, i) => (
          <MessageSkeletonPair key={i} showUserMessage={i > 0} />
        ))}
      </div>
    </div>
  );
}

// Skeleton for a user-assistant message pair
function MessageSkeletonPair({ showUserMessage }: { showUserMessage: boolean }) {
  return (
    <div className="space-y-6">
      {/* User message skeleton */}
      {showUserMessage && <UserMessageSkeleton />}

      {/* Assistant message skeleton */}
      <AssistantMessageSkeleton />
    </div>
  );
}

// User message skeleton component
function UserMessageSkeleton() {
  const width = 55; // 固定宽度避免水合错误
  
  return (
    <div className="w-full">
      {/* Message bubble aligned to right */}
      <div 
        className="ml-auto rounded-lg px-4 py-3 relative overflow-hidden"
        style={{ 
          backgroundColor: 'rgba(233, 233, 233, 0.3)',
          width: `${width}%`,
        }}
      >
        {/* Shimmer overlay */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        
        {/* Content */}
        <div className="space-y-2 relative">
          <Skeleton className="h-4 w-[85%]" />
          <Skeleton className="h-4 w-[70%]" />
          <Skeleton className="h-4 w-[40%]" />
        </div>
      </div>
    </div>
  );
}

// Assistant message skeleton component
function AssistantMessageSkeleton() {
  const hasToolBlock = false; // 固定值避免水合错误
  const lineCount = 4; // 固定行数避免水合错误
  
  return (
    <div className="w-full">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <Skeleton className="w-8 h-8 rounded-full" />
        </div>
        
        {/* Content */}
        <div className="flex-1 space-y-3 min-w-0">
          {/* Assistant label */}
          <Skeleton className="h-3 w-20" />
          
          {/* Text content */}
          <div className="space-y-2">
            {Array.from({ length: lineCount }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="h-4" 
                style={{ width: getLineWidth(i, lineCount) }}
              />
            ))}
          </div>
          
          {/* Tool/Code block */}
          {hasToolBlock && (
            <div className="mt-3 p-3 bg-muted/30 rounded-lg space-y-2">
              <Skeleton className="h-3 w-32" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-[70%]" />
                <Skeleton className="h-3 w-[85%]" />
                <Skeleton className="h-3 w-[60%]" />
              </div>
            </div>
          )}
          
          {/* Timestamp */}
          <Skeleton className="h-3 w-16 mt-2" />
        </div>
      </div>
    </div>
  );
}

// Helper function to get natural-looking line widths (固定值避免水合错误)
function getLineWidth(index: number, total: number): string {
  // First lines are usually longer
  if (index === 0) return '92%';
  if (index === 1) return '82%';
  // Last line is usually shorter
  if (index === total - 1) return '45%';
  // Middle lines vary
  return '88%';
}

// Add shimmer animation to tailwind
if (typeof window !== 'undefined' && !document.getElementById('skeleton-shimmer-style')) {
  const style = document.createElement('style');
  style.id = 'skeleton-shimmer-style';
  style.textContent = `
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
  `;
  document.head.appendChild(style);
}