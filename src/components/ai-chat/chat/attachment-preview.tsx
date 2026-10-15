"use client";

import React, { useState } from "react";
import { X, Link, FileText, File, Music, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ai-chat/chat/circular-progress";

export interface AttachmentPreviewProps {
  attachments: Array<{
    type: "image" | "file" | "audio" | "video";
    url: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    preview?: string; // For local preview before upload
    isLoading?: boolean; // Loading state
  }>;
  onRemove?: (index: number) => void;
  className?: string;
}

export function AttachmentPreview({ 
  attachments, 
  onRemove, 
  className 
}: AttachmentPreviewProps) {
  const [loadErrors, setLoadErrors] = useState<Set<number>>(new Set());

  if (attachments.length === 0) return null;

  const handleImageError = (index: number) => {
    setLoadErrors(prev => new Set(prev).add(index));
  };

  const getFileIcon = (type: string, mimeType?: string) => {
    const iconClass = "h-5 w-5 text-muted-foreground";
    
    if (type === "audio") return <Music className={iconClass} />;
    if (type === "video") return <Film className={iconClass} />;
    
    // Document types
    if (mimeType?.includes("pdf")) return <FileText className={iconClass} />;
    if (mimeType?.includes("word") || mimeType?.includes("document")) return <FileText className={iconClass} />;
    if (mimeType?.includes("sheet") || mimeType?.includes("excel")) return <FileText className={iconClass} />;
    if (mimeType?.includes("presentation") || mimeType?.includes("powerpoint")) return <FileText className={iconClass} />;
    if (mimeType?.includes("text")) return <FileText className={iconClass} />;
    
    return <File className={iconClass} />;
  };

  const getFileTypeLabel = (mimeType?: string): string => {
    if (!mimeType) return "File";
    
    // PDF
    if (mimeType.includes("pdf")) return "PDF Document";
    
    // Word documents
    if (mimeType.includes("word") || mimeType.includes("document")) return "Word Document";
    
    // Excel spreadsheets
    if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Excel Spreadsheet";
    
    // PowerPoint presentations
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "PowerPoint";
    
    // Text files
    if (mimeType.includes("text/plain")) return "Text File";
    if (mimeType.includes("text/markdown")) return "Markdown";
    
    // Audio/Video
    if (mimeType.startsWith("audio/")) return "Audio";
    if (mimeType.startsWith("video/")) return "Video";
    
    // Fallback
    return "Document";
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className={cn("flex flex-wrap gap-2 pb-2", className)}>
      {attachments.map((attachment, index) => (
        <div
          key={index}
          className="relative group animate-in fade-in zoom-in-95 duration-200"
        >
          {attachment.type === "image" && !loadErrors.has(index) ? (
            <div className="relative overflow-hidden rounded-lg border border-border/50 bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.preview ?? attachment.url}
                alt={attachment.filename ?? "Uploaded image"}
                className="h-32 w-32 object-cover"
                onError={() => handleImageError(index)}
              />
              
              {/* Loading overlay with circular progress */}
              {attachment.isLoading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-lg flex items-center justify-center transition-opacity duration-200 animate-in fade-in">
                  <CircularProgress size={48} strokeWidth={3} className="text-white drop-shadow-lg" />
                </div>
              )}
              
              {/* Overlay with actions (only when not loading) */}
              {!attachment.isLoading && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-start justify-end p-2 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 bg-white/10 hover:bg-white/20 text-white"
                    onClick={() => window.open(attachment.url, "_blank")}
                    aria-label="Open in new tab"
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                  {onRemove && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 bg-white/10 hover:bg-white/20 text-white hover:text-red-400"
                      onClick={() => onRemove(index)}
                      aria-label="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex items-center gap-3 min-w-[280px] max-w-md rounded-lg border border-border/50 bg-card p-3 pr-2 group">
              {/* File icon on the left */}
              <div className="relative shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                  {getFileIcon(attachment.type, attachment.mimeType)}
                </div>
                
                {/* Circular progress overlay on icon when loading */}
                {attachment.isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CircularProgress size={44} strokeWidth={2.5} className="text-primary" />
                  </div>
                )}
              </div>
              
              {/* File info in the middle */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {attachment.filename ?? "File"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {getFileTypeLabel(attachment.mimeType)}
                      {attachment.size && ` • ${formatFileSize(attachment.size)}`}
                    </p>
                  </div>
                  
                  {/* Delete button on the right (only when not loading) */}
                  {!attachment.isLoading && onRemove && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onRemove(index)}
                      aria-label="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

