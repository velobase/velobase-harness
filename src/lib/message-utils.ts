import type { UIMessage } from "@velobase/ai-chat/tools";
import { createLogger } from "@/lib/logger";

const logger = createLogger("message-utils");

/**
 * Filter UIMessages to remove tool calls not supported by current agent
 * 
 * This prevents validation errors when switching between agents with different tool sets.
 * When a user switches agents, the message history may contain tool calls that the new
 * agent doesn't support, which would cause API errors.
 * 
 * Note: Interrupted tool calls (in "input-available" state without output) are handled
 * automatically by convertToModelMessages with the ignoreIncompleteToolCalls option.
 */
export function filterUnsupportedToolCalls(
  messages: UIMessage[],
  activeTools: string[]
): UIMessage[] {
  const removedTools = new Set<string>();
  
  const filtered = messages.map(msg => {
    // Only process assistant messages (they contain tool calls)
    if (msg.role !== 'assistant') return msg;
    
    // Filter out tool-related parts that reference unavailable tools
    const filteredParts = msg.parts.filter(part => {
      if (typeof part !== 'object' || part === null) return true;
      
      const typedPart = part as Record<string, unknown>;
      const partType = typedPart.type as string;
      
      // Check if this is a tool part (type: "tool-{toolName}")
      if (partType?.startsWith('tool-')) {
        // Extract tool name from type (e.g., "tool-generate_image" -> "generate_image")
        const toolName = partType.replace(/^tool-/, '');
        const isSupported = activeTools.includes(toolName);
        
        // Track removed tools for logging
        if (!isSupported) {
          removedTools.add(toolName);
        }
        
        return isSupported;
      }
      
      // Keep all non-tool parts (text, reasoning, step-start, etc.)
      return true;
    });
    
    return {
      ...msg,
      parts: filteredParts,
    };
  });
  
  // Log removed tools if any
  if (removedTools.size > 0) {
    logger.info(
      { removedTools: Array.from(removedTools), activeTools },
      "Filtered out unsupported tool calls from message history"
    );
  }
  
  return filtered;
}

