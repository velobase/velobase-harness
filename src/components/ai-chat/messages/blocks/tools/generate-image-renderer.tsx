"use client";

import React, { memo, useState } from "react";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
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

export const GenerateImageRenderer = memo(function GenerateImageRenderer({
  data,
}: {
  data: ToolPartData;
}) {
  const [imageError, setImageError] = useState(false);
  
  const input = parseJson<{
    prompt?: string;
    size?: string;
    style?: string;
    quality?: string;
  }>(data.input);
  
  const output = parseJson<{
    success?: boolean;
    pending?: boolean;
    image_url?: string;
    imageUrl?: string;  // Support both formats for backward compatibility
    image_id?: string;
    imageId?: string;  // Support both formats for backward compatibility
    message?: string;
  }>(data.output);

  const isLoading = data.state === 'input-available' || data.state === 'input-streaming' || output?.pending === true;
  const hasError = data.state === 'output-error' || imageError || (data.state === 'output-available' && output?.success === false && !output.pending);
  const isSuccess = data.state === 'output-available' && output?.success === true;
  
  // Support both snake_case and camelCase field names
  const imageUrl = output?.image_url ?? output?.imageUrl;

  return (
    <div className="my-2">
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>正在生成图片...</span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>
            无法生成图片
            {(data.error ?? output?.message) && (
              <span className="text-sm ml-1">: {data.error ?? output?.message}</span>
            )}
          </span>
        </div>
      )}

      {/* Success state - Image is the hero */}
      {isSuccess && imageUrl && !imageError && (
        <div className="space-y-2">
          {/* Image with minimal framing */}
          <div className="relative rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={input?.prompt ?? "Generated image"}
              className="w-full h-auto"
              onError={() => setImageError(true)}
            />
            {/* Simple action button */}
            <div className="absolute top-2 right-2">
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-black/50 hover:bg-black/70 text-white text-xs transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                查看
              </a>
            </div>
          </div>
          
          {/* Prompt as caption - only if exists */}
          {input?.prompt && (
            <p className="text-sm text-muted-foreground italic">
              &ldquo;{input.prompt}&rdquo;
            </p>
          )}
        </div>
      )}
      
      {/* Image error */}
      {isSuccess && imageError && (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <span>图片加载失败</span>
        </div>
      )}
    </div>
  );
});

