"use client";

import React, { memo, useState } from "react";
import { Video, Loader2, AlertCircle, ExternalLink, Download, Clock } from "lucide-react";
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

export const GenerateVideoRenderer = memo(function GenerateVideoRenderer({
  data,
}: {
  data: ToolPartData;
}) {
  const [videoError, setVideoError] = useState(false);
  
  const input = parseJson<{
    prompt?: string;
    model?: string;
    duration?: string;
  }>(data.input);
  
  const output = parseJson<{
    success?: boolean;
    video_url?: string;
    video_id?: string;
    model?: string;
    duration?: string;
    message?: string;
    error?: string;
  }>(data.output);

  const isLoading = data.state === 'input-available' || data.state === 'input-streaming';
  const hasError = data.state === 'output-error' || (output && !output.success);
  const isSuccess = data.state === 'output-available' && output?.success;

  return (
    <div className="my-2 rounded-lg border border-border/50 bg-gradient-to-br from-red-50/30 to-orange-50/30 dark:from-red-950/10 dark:to-orange-950/10 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 bg-gradient-to-r from-red-500/5 to-orange-500/5">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-red-600 dark:text-red-400" />
          <span className="font-medium text-sm">视频生成</span>
          {input?.model && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
              {input.model}
            </span>
          )}
          {input?.duration && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {input.duration}s
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Prompt */}
        {input?.prompt && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">提示词</div>
            <div className="text-sm bg-muted/30 rounded p-2 border border-border/30">
              {input.prompt}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground py-6">
            <Loader2 className="h-5 w-5 animate-spin text-red-600" />
            <div>
              <div className="font-medium">正在生成视频...</div>
              <div className="text-xs">这通常需要 1-3 分钟，请耐心等待</div>
            </div>
          </div>
        )}

        {/* Error state */}
        {hasError && (
          <div className="flex items-center gap-2 p-3 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="text-sm text-red-700 dark:text-red-300">
              {output?.error ?? data.error ?? "视频生成失败"}
            </div>
          </div>
        )}

        {/* Success state with video */}
        {isSuccess && output?.video_url && (
          <div className="space-y-3">
            {/* Video player */}
            <div className="relative rounded-lg overflow-hidden bg-black">
              {!videoError ? (
                <video
                  src={output.video_url}
                  controls
                  className="w-full"
                  onError={() => setVideoError(true)}
                  preload="metadata"
                >
                  您的浏览器不支持视频播放
                </video>
              ) : (
                <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  视频加载失败
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <a
                href={output.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                新窗口打开
              </a>
              <a
                href={`/api/download/video?url=${encodeURIComponent(output.video_url)}&filename=video-${output.video_id ?? Date.now()}.mp4`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted text-xs font-medium transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                下载视频
              </a>
            </div>

            {/* Info */}
            {output.message && (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                {output.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

