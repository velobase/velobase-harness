"use client";

import React, { memo, useState } from "react";
import { Edit2, Loader2, AlertCircle, ExternalLink } from "lucide-react";
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

export const EditImageRenderer = memo(function EditImageRenderer({
  data,
}: {
  data: ToolPartData;
}) {
  const [imageError, setImageError] = useState<'parent' | 'edited' | null>(null);
  
  const input = parseJson<{
    image?: string;
    instruction?: string;
  }>(data.input);
  
  const output = parseJson<{
    success?: boolean;
    pending?: boolean;
    image_url?: string;
    parent_id?: string;
    message?: string;
    parentImageUrl?: string; // This might be included in some responses
  }>(data.output);

  const isLoading = data.state === 'input-available' || data.state === 'input-streaming' || output?.pending === true;
  const hasError = data.state === 'output-error' || (data.state === 'output-available' && output?.success === false && !output.pending);
  const isSuccess = data.state === 'output-available' && output?.success === true;

  return (
    <div className="my-2">
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>正在编辑图片...</span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>
            无法编辑图片
            {(data.error ?? output?.message) && (
              <span className="text-sm ml-1">: {data.error ?? output?.message}</span>
            )}
          </span>
        </div>
      )}

      {/* Success state - Before/After comparison */}
      {isSuccess && output?.image_url && (
        <div className="space-y-2">
          {/* Edit instruction */}
          {input?.instruction && (
            <div className="flex items-center gap-2 text-sm">
              <Edit2 className="h-4 w-4 text-muted-foreground" />
              <span className="italic text-muted-foreground">
                &ldquo;{input.instruction}&rdquo;
              </span>
            </div>
          )}
          
          {/* Image result - single image */}
          <div className="relative rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={output.image_url}
              alt="Edited image"
              className="w-full h-auto"
              onError={() => setImageError('edited')}
            />
            {/* Simple action button */}
            <div className="absolute top-2 right-2">
              <a
                href={output.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-black/50 hover:bg-black/70 text-white text-xs transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                查看
              </a>
            </div>
          </div>
          
          {/* Image error */}
          {imageError === 'edited' && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span>编辑后的图片加载失败</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
