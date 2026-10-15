"use client";

import React, { memo } from "react";
import { FolderOpen, Loader2, AlertCircle } from "lucide-react";
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

export const ListDocumentsRenderer = memo(function ListDocumentsRenderer({
  data,
}: {
  data: ToolPartData;
}) {
  const output = parseJson<{ 
    documents?: Array<{ id: string }>; 
    total?: number;
    error?: string;
  }>(data.output);

  const isLoading = data.state === 'input-available' || data.state === 'input-streaming';
  const hasError = data.state === 'output-error' || !!output?.error;
  const isSuccess = data.state === 'output-available' && !output?.error;

  return (
    <div className="my-2">
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>正在获取文档列表...</span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>
            无法获取文档列表
            {(data.error ?? output?.error) && (
              <span className="text-sm ml-1">: {data.error ?? output?.error}</span>
            )}
          </span>
        </div>
      )}

      {/* Success state - Simple count */}
      {isSuccess && output?.documents && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span>AI 读取了文件列表（{output.total ?? output.documents.length} 个文档）</span>
        </div>
      )}
    </div>
  );
});
