/**
 * Guest Mode Configuration
 * 
 * Centralized configuration for all guest (unauthenticated) user behavior
 */

export const GUEST_MODE_CONFIG = {
  // =============================================================================
  // Feature Toggles
  // =============================================================================
  
  /**
   * Allow guest users to chat without login
   */
  ENABLED: true,
  
  /**
   * Allow guests to start new chats
   * Set to false to limit guests to only one conversation total
   */
  ALLOW_NEW_CHAT_REPEAT: false,
  
  // =============================================================================
  // Rate Limiting Configuration
  // =============================================================================
  
  /**
   * Maximum AI replies per conversation for guest users
   * Guest can send messages until they receive this many AI replies
   */
  MAX_REPLIES_PER_CONVERSATION: 3,
  
  /**
   * Maximum messages per day per guest ID (derived from the HTTP-only ownership cookie)
   * This is the primary rate limit
   */
  MAX_MESSAGES_PER_GUEST_ID_PER_DAY: 3,
  
  /**
   * Maximum messages per day per IP address
   * Secondary rate limit to prevent abuse by clearing cookies
   * Should be higher than MAX_MESSAGES_PER_GUEST_ID_PER_DAY to allow multiple devices
   */
  MAX_MESSAGES_PER_IP_PER_DAY: 10,
  
  /**
   * Rate limit window in seconds (default: 24 hours)
   */
  RATE_LIMIT_WINDOW_SECONDS: 86400,
  
  // =============================================================================
  // Agent Configuration
  // =============================================================================
  
  /**
   * Default agent ID for guest users
   */
  DEFAULT_GUEST_AGENT: 'agent_default_assistant',
  
  // =============================================================================
  // UI Configuration
  // =============================================================================
  
  /**
   * Toast notification duration in milliseconds
   */
  TOAST_DURATION: 10000,
} as const;

/**
 * Guest Mode Copy/Messages
 * 
 * Centralized text content for guest mode UI
 * Messages dynamically reference GUEST_MODE_CONFIG values
 */
export const GUEST_MODE_COPY = {
  // Gate Overlay (blocks input after reaching limit)
  GATE_TITLE: 'Sign in to continue',
  GATE_DESCRIPTION: () => 
    `You have ${GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION} free ${
      (GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION as number) === 1 ? 'reply' : 'replies'
    }. Sign in to keep chatting and save your conversations.`,
  GATE_CTA: 'Sign in',
  
  // Toast notification (appears after last free reply)
  TOAST_TITLE: 'Sign in to continue',
  TOAST_DESCRIPTION: () => 
    `You've used your ${GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION} free ${
      (GUEST_MODE_CONFIG.MAX_REPLIES_PER_CONVERSATION as number) === 1 ? 'reply' : 'replies'
    }. Sign in to keep chatting.`,
  TOAST_CTA: 'Sign in',
  
  // Sidebar empty state
  SIDEBAR_TITLE: 'Sign in to save and sync',
  SIDEBAR_DESCRIPTION: 'Your conversations will be saved across devices',
  SIDEBAR_CTA: 'Sign in',
  
  // Backend error message
  BACKEND_ERROR_MESSAGE: 'Sign in to continue chatting',
} as const;

