import { useState, useEffect } from "react";
import { useAuthStore } from "@/components/auth/store/auth-store";
import { toast } from "sonner";
import { GUEST_MODE_COPY, GUEST_MODE_CONFIG } from "@/config/guest-mode";

/**
 * Guest gate hook
 * Shows login prompt after first AI reply and disables input
 */
export function useGuestGate(
  isGuest: boolean,
  lastMessage: { role: string } | undefined
) {
  const [hasReceivedFirstReply, setHasReceivedFirstReply] = useState(false);
  const { setLoginModalOpen } = useAuthStore();

  useEffect(() => {
    if (!isGuest || hasReceivedFirstReply) return;
    
    if (lastMessage?.role === "assistant") {
      setHasReceivedFirstReply(true);
      
      // Show login prompt toast
      toast(GUEST_MODE_COPY.TOAST_TITLE, {
        description: GUEST_MODE_COPY.TOAST_DESCRIPTION,
        action: {
          label: GUEST_MODE_COPY.TOAST_CTA,
          onClick: () => setLoginModalOpen(true, "/", "generate_gate"),
        },
        duration: GUEST_MODE_CONFIG.TOAST_DURATION,
      });
    }
  }, [isGuest, lastMessage, hasReceivedFirstReply, setLoginModalOpen]);

  return {
    hasReceivedFirstReply,
    shouldDisableInput: isGuest && hasReceivedFirstReply,
  };
}

