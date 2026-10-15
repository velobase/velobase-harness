"use client";

import React, { memo } from "react";
import { Video, Loader2, AlertCircle } from "lucide-react";
import type { ToolPartData } from "@/components/ai-chat/messages/blocks/tools/registry";

function parseJson<T = unknown>(input: unknown): T | undefined {
  if (typeof input === "string") {
    try {
      return JSON.parse(input) as T;
    } catch {
      return undefined;
    }
  }
  if (input && typeof input === "object") return input as T;
  return undefined;
}

export const ListProjectVideosRenderer = memo(function ListProjectVideosRenderer({
  data,
}: {
  data: ToolPartData;
}) {
  const output = parseJson<{ 
    videos?: Array<{ id: string }>; 
    total?: number;
    success?: boolean;
    error?: string;
  }>(data.output);

  const isLoading = data.state === 'input-available' || data.state === 'input-streaming';
  const hasError = data.state === 'output-error' || !output?.success;
  const isSuccess = data.state === 'output-available' && output?.success;

  return (
    <div className="my-2">
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>正在获取视频列表...</span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>
            无法获取视频列表
            {(data.error ?? output?.error) && (
              <span className="text-sm ml-1">: {data.error ?? output?.error}</span>
            )}
          </span>
        </div>
      )}

      {/* Success state - Simple count */}
      {isSuccess && output?.videos && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Video className="h-4 w-4" />
          <span>AI 查看了视频库（{output.total ?? output.videos.length} 个视频）</span>
        </div>
      )}
    </div>
  );
});

