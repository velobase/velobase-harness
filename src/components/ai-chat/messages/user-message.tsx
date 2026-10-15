"use client";

import React, { memo, useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { ChatUIMessage } from "@/types/ai-chat/message";
import { UserMessageActions } from "@/components/ai-chat/messages/user-message-actions";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface UserMessageProps {
  content?: string;
  message?: ChatUIMessage;
  className?: string;
  onEdit?: (messageId: string, newContent: string) => void;
  isReadOnly?: boolean;
}

const UserMessageImpl = React.forwardRef<HTMLDivElement, UserMessageProps>(
  function UserMessageImpl({ content, message, className, onEdit, isReadOnly = false }, ref) {
    // Extract text and file parts from message
    const textContent = content ?? (message ? getTextContent(message) : "");
    const fileParts = message ? getFileParts(message) : [];
    const docProcessingParts = message ? getDocumentProcessingParts(message) : [];
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editedContent, setEditedContent] = useState(textContent);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    // Focus textarea when entering edit mode
    useEffect(() => {
      if (isEditing && textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          textareaRef.current.value.length,
          textareaRef.current.value.length
        );
      }
    }, [isEditing]);
    
    const handleStartEdit = useCallback(() => {
      setEditedContent(textContent);
      setIsEditing(true);
    }, [textContent]);
    
    const handleSave = useCallback(() => {
      if (editedContent.trim() && editedContent !== textContent && message && onEdit) {
        onEdit(message.id, editedContent.trim());
      }
      setIsEditing(false);
    }, [editedContent, textContent, message, onEdit]);
    
    const handleCancel = useCallback(() => {
      setEditedContent(textContent);
      setIsEditing(false);
    }, [textContent]);
    
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    }, [handleSave, handleCancel]);
    
    return (
      <div className={cn("w-full flex flex-col gap-2", className)}>
        {/* File attachments */}
        {fileParts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {fileParts.map((file, index) => (
              <FileAttachmentDisplay key={index} file={file} />
            ))}
          </div>
        )}
        
        {/* User message content - editable or static */}
        {textContent && (
          <div ref={ref} className="w-full">
            {isEditing ? (
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full min-h-[100px] whitespace-pre-wrap text-[15px] font-sans leading-[1.7] rounded-lg px-4 py-3 border-2 border-primary focus:outline-none resize-y"
                  style={{
                    backgroundColor: 'rgba(233, 233, 233, 0.5)',
                    overflowWrap: 'anywhere',
                    wordBreak: 'normal'
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!editedContent.trim() || editedContent === textContent}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancel}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div 
                className="max-w-full whitespace-pre-wrap text-[15px] font-sans leading-[1.7] rounded-lg px-4 py-3" 
                style={{ 
                  backgroundColor: 'rgba(233, 233, 233, 0.5)',
                  overflowWrap: 'anywhere',
                  wordBreak: 'normal'
                }}
              >
                {textContent}
              </div>
            )}
          </div>
        )}
        
        {/* Document processing status (optional) */}
        {docProcessingParts.length > 0 && (
          <div className="text-xs text-muted-foreground pl-4">
            {docProcessingParts.map((part, index) => {
              const docPart = part as {
                data: {
                  filename: string;
                  status: "loading" | "completed" | "failed";
                  error?: string;
                };
              };
              return (
                <div key={index} className="flex items-center gap-1">
                  {docPart.data.status === "loading" && "📄 处理中..."}
                  {docPart.data.status === "completed" && "✅ 文档已处理"}
                  {docPart.data.status === "failed" && (
                    <span className="text-destructive">
                      ❌ 处理失败: {docPart.data.error}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Message actions */}
        {message && textContent && !isEditing && !isReadOnly && (
          <UserMessageActions
            messageId={message.id}
            content={textContent}
            onEdit={handleStartEdit}
          />
        )}
      </div>
    );
  }
);

export const UserMessage = memo(UserMessageImpl);

// Helper functions
function getTextContent(message: ChatUIMessage): string {
  return message.parts
    .filter(part => typeof part === 'object' && part !== null && 'type' in part && part.type === 'text')
    .map(part => {
      if (typeof part === 'object' && part !== null && 'text' in part) {
        return String(part.text);
      }
      return '';
    })
    .join('');
}

interface FilePart {
  type: 'file';
  url: string;
  filename?: string;
  mediaType: string;
}

function getFileParts(message: ChatUIMessage): FilePart[] {
  return message.parts.filter(part => {
    if (typeof part === 'object' && part !== null && 'type' in part) {
      return part.type === 'file';
    }
    return false;
  }) as FilePart[];
}

function getDocumentProcessingParts(message: ChatUIMessage) {
  return message.parts.filter(part => {
    if (typeof part === 'object' && part !== null && 'type' in part) {
      return part.type === 'data-documentProcessing';
    }
    return false;
  });
}

// File attachment display component
function FileAttachmentDisplay({ file }: { file: FilePart }) {
  const isImage = file.mediaType.startsWith('image/');
  const filename = file.filename ?? file.url.split('/').pop() ?? 'file';
  
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-background/80 rounded-lg border border-border/50 max-w-sm">
      {isImage ? (
        <a href={file.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={file.url} 
            alt={filename}
            className="h-20 w-20 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
          />
        </a>
      ) : (
        <div className="h-12 w-12 flex items-center justify-center bg-muted rounded flex-shrink-0">
          <FileIcon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium truncate">{filename}</span>
        <a 
          href={file.url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Open file
        </a>
      </div>
    </div>
  );
}

// Simple file icon
function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  );
}

