import { db } from "@/server/db";
import { NotFoundError } from "@/types/ai-chat/errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("agent-config-service");

export interface AgentConfig {
  id: string;
  name: string;
  instructions: string;
  model: string;
  tools: string[];
  enabled: boolean;
}

/**
 * Load agent configuration for guest user
 */
export async function loadGuestAgentConfig(
  agentId: string,
): Promise<AgentConfig> {
  const systemAgent = await db.agent.findUnique({
    where: { id: agentId },
  });

  if (!systemAgent || !systemAgent.isSystem || !systemAgent.enabled) {
    throw new NotFoundError("Agent not found or not available");
  }

  logger.info(
    { agentId: systemAgent.id, model: systemAgent.model },
    "Loaded guest agent config",
  );

  return {
    id: systemAgent.id,
    name: systemAgent.name,
    instructions: systemAgent.instructions,
    model: systemAgent.model,
    tools: systemAgent.tools || [],
    enabled: systemAgent.enabled,
  };
}

/**
 * Load agent configuration for logged-in user
 */
export async function loadUserAgentConfig(
  userAgentId: string,
  userId: string,
): Promise<AgentConfig> {
  const userAgent = await db.userAgent.findUnique({
    where: { id: userAgentId },
    include: { agent: true },
  });

  if (
    !userAgent ||
    userAgent.userId !== userId ||
    !userAgent.enabled ||
    !userAgent.agent.enabled
  ) {
    throw new NotFoundError("Agent not installed or not found");
  }

  logger.info(
    {
      userAgentId,
      agentId: userAgent.agent.id,
      model: userAgent.customModel ?? userAgent.agent.model,
    },
    "Loaded user agent config",
  );

  return {
    id: userAgent.agent.id,
    name: userAgent.agent.name,
    instructions: userAgent.customInstructions ?? userAgent.agent.instructions,
    model: userAgent.customModel ?? userAgent.agent.model,
    tools: userAgent.agent.tools || [],
    enabled: userAgent.enabled,
  };
}
