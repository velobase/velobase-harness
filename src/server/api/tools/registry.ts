import { ToolRegistry } from "@velobase/ai-chat/tools";
import { createLogger } from "@/lib/logger";
export type {
  ToolContext,
  ToolConfig,
  ToolFactory,
} from "@velobase/ai-chat/tools";
/** Complete-example registry; selected business tools are registered in ./index. */
export const toolRegistry = new ToolRegistry(createLogger("tool-registry"));
