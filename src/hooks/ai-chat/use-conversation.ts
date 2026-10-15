"use client";

import { useState } from "react";
import { api as trpcApi } from "@/trpc/react";

export interface UseConversationOptions {
  conversationId?: string;
}

export interface UseConversationReturn {
  id: string | undefined;
  createConversation: (isGuest?: boolean, projectId?: string, metadata?: Record<string, unknown>) => Promise<string>;
  isCreating: boolean;
}

/**
 * Simple hook for managing conversation ID
 * 
 * @param conversationId - Optional initial conversation ID
 * @returns id and createConversation function
 */
export function useConversation(conversationId?: string): UseConversationReturn {
  const [id, setId] = useState(conversationId);
  
  const utils = trpcApi.useUtils();
  
  const createMutation = trpcApi.conversation.create.useMutation({
    onSuccess: () => {
      // Refresh conversation list in sidebar
      void utils.conversation.list.invalidate();
    },
  });
  const createGuestMutation = trpcApi.conversation.createGuest.useMutation({
    onSuccess: () => {
      // Refresh conversation list in sidebar
      void utils.conversation.list.invalidate();
    },
  });
  
  const createConversation = async (isGuest = false, projectId?: string, metadata?: Record<string, unknown>) => {
    const mutation = isGuest ? createGuestMutation : createMutation;
    const result = await mutation.mutateAsync(
      isGuest ? {} : { projectId, metadata }
    );
    setId(result.id);
    return result.id;
  };
  
  return { 
    id, 
    createConversation,
    isCreating: createMutation.isPending || createGuestMutation.isPending,
  };
}