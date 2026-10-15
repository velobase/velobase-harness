"use client";

import React, { useState, useCallback } from "react";
import { Copy, Edit3, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageActionButton } from "@/components/ai-chat/messages/message-action-button";
import { toast } from "sonner";

interface UserMessageActionsProps {
  messageId: string;
  content: string;
  onEdit?: () => void;
  className?: string;
}

export function UserMessageActions({
  messageId: _messageId,
  content,
  onEdit,
  className,
}: UserMessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy");
    }
  }, [content]);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      onEdit();
    }
  }, [onEdit]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 mt-2",
        className
      )}
    >
      {/* Copy button */}
      <MessageActionButton
        icon={copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        label="Copy"
        onClick={handleCopy}
      />

      {/* Edit button */}
      <MessageActionButton
        icon={<Edit3 className="w-4 h-4" />}
        label="Edit message"
        onClick={handleEdit}
      />
    </div>
  );
}

