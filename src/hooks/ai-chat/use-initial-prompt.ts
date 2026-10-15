import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Handle initial prompt from URL (idempotent)
 * Sends prompt once and cleans up URL
 */
export function useInitialPrompt(
  conversationId: string | undefined,
  messageCount: number,
  sendMessage: (text: string) => void | Promise<void>
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasSentRef = useRef(false);

  useEffect(() => {
    const prompt = searchParams.get("prompt");
    
    if (!prompt || !conversationId || messageCount > 0 || hasSentRef.current) {
      return;
    }

    // Idempotency check (prevent StrictMode double mount)
    if (typeof window !== "undefined") {
      const key = `chat_initial_sent:${conversationId}`;
      const alreadySent = sessionStorage.getItem(key);
      
      if (alreadySent === prompt) {
        router.replace(`/chat/${conversationId}`, { scroll: false });
        return;
      }
      
      sessionStorage.setItem(key, prompt);
    }

    hasSentRef.current = true;
    void sendMessage(prompt);
    router.replace(`/chat/${conversationId}`, { scroll: false });
  }, [conversationId, messageCount, searchParams, sendMessage, router]);
}

