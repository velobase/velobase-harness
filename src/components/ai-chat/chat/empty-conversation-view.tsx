"use client";

import React from "react";
import { MessageSquare } from "lucide-react";

/**
 * EmptyConversationView - 用于已有会话但消息为空时
 * 简洁提示，不包含营销内容
 */
export function EmptyConversationView() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-medium text-foreground">
            Start a conversation
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Send a message below to begin chatting with your AI assistant
          </p>
        </div>
      </div>
    </div>
  );
}

