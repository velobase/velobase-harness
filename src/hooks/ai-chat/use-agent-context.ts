import { useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAgentStore } from "@/stores/agent-store";

export interface AgentContext {
  userAgentId?: string;
  agentId?: string;
  guestId?: string;
  isReady: boolean;
}

/**
 * Unified agent context hook
 * Manages agent/userAgent/guestId for both guest and logged-in users
 */
export function useAgentContext(isGuest: boolean): AgentContext {
  const searchParams = useSearchParams();
  const { selectedUserAgentId } = useAgentStore();
  
  // URL parameters
  const initialAgentId = searchParams.get("agentId");
  const initialUserAgentId = searchParams.get("userAgentId");
  
  // Persistent refs (survive URL cleanup)
  const userAgentIdRef = useRef<string | undefined>(
    initialUserAgentId ?? selectedUserAgentId ?? undefined
  );
  const agentIdRef = useRef<string | undefined>(
    isGuest ? (initialAgentId ?? undefined) : undefined
  );
  
  // Guest ID (from localStorage)
  const guestId = isGuest ? getOrCreateGuestId() : undefined;
  
  // Sync logic
  useEffect(() => {
    if (!isGuest) {
      if (!userAgentIdRef.current && (initialUserAgentId || selectedUserAgentId)) {
        userAgentIdRef.current = initialUserAgentId ?? selectedUserAgentId ?? undefined;
      }
    } else {
      if (!agentIdRef.current && initialAgentId) {
        agentIdRef.current = initialAgentId;
      }
    }
  }, [isGuest, initialUserAgentId, selectedUserAgentId, initialAgentId]);
  
  const isReady = isGuest 
    ? !!(agentIdRef.current && guestId)
    : !!userAgentIdRef.current;
  
  return {
    userAgentId: userAgentIdRef.current,
    agentId: agentIdRef.current,
    guestId,
    isReady,
  };
}

function getOrCreateGuestId(): string {
  if (typeof window === "undefined") return "";
  
  const STORAGE_KEY = "app_guest_id";
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (stored) return stored;
  
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 11);
  const guestId = `guest_${timestamp}_${random}`;
  
  localStorage.setItem(STORAGE_KEY, guestId);
  return guestId;
}

