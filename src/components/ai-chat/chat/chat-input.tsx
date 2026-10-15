"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Square, Plus, ArrowUp, Paperclip, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AttachmentPreview } from "@/components/ai-chat/chat/attachment-preview";

export interface AttachmentData {
  type: "image" | "file" | "audio" | "video";
  url: string;
  storageKey?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  preview?: string; // For local preview
  isLoading?: boolean; // Loading state for upload/processing
}

interface ChatInputProps {
  onSendMessage: (text: string, attachments?: AttachmentData[]) => void | Promise<void>;
  onStopGeneration?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  isGenerating?: boolean;
  onFileUpload?: (files: File[]) => Promise<AttachmentData[]>;
  autoFocus?: boolean;
  disableFileUpload?: boolean; // Hide file upload for guests
}

/**
 * Modern capsule-style chat input component
 * 
 * Features:
 * - Capsule design with rounded corners
 * - File attachment support with preview
 * - Plus menu for additional actions
 * - Voice input button
 * - Auto-resize textarea
 * - Loading states
 * 
 * @example
 * <ChatInput
 *   onSendMessage={(text, attachments) => sendMessage(text, attachments)}
 *   onStopGeneration={stop}
 *   disabled={isStreaming}
 *   isGenerating={isStreaming}
 *   placeholder="Message Forgica..."
 * />
 */
export function ChatInput({
  onSendMessage,
  onStopGeneration,
  disabled = false,
  placeholder = "Type a message...",
  className,
  isGenerating = false,
  onFileUpload,
  autoFocus = false,
  disableFileUpload = false,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<AttachmentData[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!value.trim() && attachments.length === 0) return;
      if (disabled) return;
      
      const submitValue = value.trim();
      const submitAttachments = [...attachments];
      
      // Clear immediately for better UX
      setValue("");
      setAttachments([]);
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      
      await onSendMessage(submitValue, submitAttachments.length > 0 ? submitAttachments : undefined);
    },
    [onSendMessage, value, attachments, disabled]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        
        // Check if not composing (IME input like Chinese)
        if (!(e.nativeEvent as unknown as { isComposing: boolean }).isComposing) {
          if (isGenerating && onStopGeneration) {
            onStopGeneration();
          } else {
            void handleSubmit();
          }
        }
      }
    },
    [handleSubmit, isGenerating, onStopGeneration]
  );

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  // Get file type from mime type
  const getFileType = useCallback((mimeType: string): AttachmentData['type'] => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'file';
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !onFileUpload) return;

    // Create local previews (especially for images)
    const previewAttachments: AttachmentData[] = files.map(file => {
      const attachment: AttachmentData = {
        type: getFileType(file.type),
        url: '', // Will be filled after upload
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        isLoading: true, // Start in loading state
      };

      // Create local preview for images
      if (attachment.type === 'image') {
        attachment.preview = URL.createObjectURL(file);
      }

      return attachment;
    });

    // Show preview immediately
    setAttachments(prev => [...prev, ...previewAttachments]);

    try {
      const uploadedAttachments = await onFileUpload(files);
      
      // Update with uploaded URLs and remove loading state
      setAttachments(prev => {
        const newAttachments = [...prev];
        const startIndex = newAttachments.length - previewAttachments.length;
        
        uploadedAttachments.forEach((uploaded, index) => {
          if (newAttachments[startIndex + index]) {
            const targetAttachment = newAttachments[startIndex + index];
            if (targetAttachment) {
              // Clean up local preview URL
              if (targetAttachment.preview) {
                URL.revokeObjectURL(targetAttachment.preview);
              }
              // Update with uploaded data and remove loading state
              newAttachments[startIndex + index] = {
                ...uploaded,
                isLoading: false,
              };
            }
          }
        });
        
        return newAttachments;
      });
    } catch (error) {
      console.error('File upload failed:', error);
      // Remove failed previews
      setAttachments(prev => prev.slice(0, prev.length - previewAttachments.length));
    }

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFileUpload, getFileType]);

  // Handle menu item clicks
  const handleMenuItemClick = useCallback((action: string) => {
    setIsMenuOpen(false);
    
    if (action === 'attach') {
      fileInputRef.current?.click();
    }
  }, []);

  // Remove attachment
  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments(prev => {
      // Clean up preview URL of removed attachment
      const previewUrl = prev[index]?.preview;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Clean up preview URLs on unmount
  useEffect(() => {
    const currentAttachments = attachments;
    return () => {
      // Clean up all preview URLs on unmount
      currentAttachments.forEach(attachment => {
        if (attachment.preview) {
          URL.revokeObjectURL(attachment.preview);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("w-full px-3 sm:px-4 md:px-6 pb-3 md:pb-4", className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/gif"
      />

      {/* Attachments preview */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        className="mb-2"
      />

      {/* Capsule input container */}
      <div className="flex items-end gap-2 rounded-[28px] ring-1 ring-border/60 bg-card/90 dark:bg-background/60 px-4 sm:px-5 py-2.5 min-h-14 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70 dark:supports-[backdrop-filter]:bg-background/50">
        {/* Plus Menu */}
        {!disableFileUpload && (
          <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 sm:h-8 sm:w-8 rounded-full text-muted-foreground shrink-0 hover:bg-muted/50"
                aria-label="Add attachments"
                disabled={disabled && !isGenerating}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent 
              align="start" 
              side="top" 
              className="w-56 p-1"
              sideOffset={8}
            >
              <div className="grid gap-0.5">
                <button
                  type="button"
                  onClick={() => handleMenuItemClick('attach')}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors text-left w-full"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span>Add photos & files</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled && !isGenerating}
          autoFocus={autoFocus}
          className="border-0 bg-transparent dark:bg-transparent shadow-none resize-none focus-visible:ring-0 focus-visible:border-0 min-h-8 max-h-48 overflow-y-auto px-0 py-1"
          rows={1}
        />

        {/* Right buttons */}
        <div className="flex items-center gap-1 pr-1 shrink-0">
          {/* Send/Stop button */}
          {isGenerating && onStopGeneration ? (
            <Button
              onClick={onStopGeneration}
              size="icon"
              className="h-10 w-10 sm:h-9 sm:w-9 rounded-full transition-all"
              variant="secondary"
              aria-label="Stop generation"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => void handleSubmit()}
              disabled={(!value.trim() && attachments.length === 0) || disabled}
              size="icon"
              className="h-10 w-10 sm:h-9 sm:w-9 rounded-full transition-all disabled:opacity-30"
              aria-label="Send message"
            >
              {disabled ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
              )}
            </Button>
          )}
        </div>
      </div>
      
      {/* Helper text */}
      <div className="mt-2 text-xs text-muted-foreground hidden sm:block text-center">
        <p>Press Enter to send, Shift + Enter for new line</p>
      </div>
    </div>
  );
}
