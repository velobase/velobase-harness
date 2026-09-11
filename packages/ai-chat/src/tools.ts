import type { ToolSet, UIMessage } from "ai";
import { z } from "zod";

export interface ToolContext {
  projectId?: string;
  userId?: string;
  conversationId?: string;
  [key: string]: unknown;
}
export type ToolFactory = (context?: ToolContext) => ToolSet;
export interface ToolConfig {
  name: string;
  description: string;
  factory: ToolFactory;
}
export interface ToolLogger {
  warn(data: Record<string, unknown>, message: string): void;
}

/** One registry per host composition; it neither imports nor auto-registers built-in tools. */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolConfig>();
  constructor(private readonly logger?: ToolLogger) {}
  register(config: ToolConfig): void {
    z.string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .parse(config.name);
    if (this.tools.has(config.name))
      throw new Error(`Duplicate chat tool group: ${config.name}`);
    this.tools.set(config.name, config);
  }
  get(name: string): ToolFactory | undefined {
    return this.tools.get(name)?.factory;
  }
  list(): ToolConfig[] {
    return Array.from(this.tools.values());
  }
  has(name: string): boolean {
    return this.tools.has(name);
  }

  prepare(names: readonly string[], context: ToolContext): ToolSet {
    const tools: ToolSet = Object.create(null) as ToolSet;
    for (const name of new Set(names)) {
      const factory = this.get(name);
      if (!factory) {
        this.logger?.warn(
          { name },
          "Chat tool group is not installed in this host",
        );
        continue;
      }
      const prepared = factory(context);
      if (!prepared || typeof prepared !== "object" || Array.isArray(prepared))
        throw new Error(`Invalid chat tool group: ${name}`);
      for (const [key, value] of Object.entries(prepared)) {
        z.string()
          .regex(/^[a-zA-Z0-9_-]{1,128}$/)
          .parse(key);
        if (Object.hasOwn(tools, key))
          throw new Error(`Duplicate chat tool name: ${key}`);
        tools[key] = value;
      }
    }
    return tools;
  }
}

/** A model change can remove tools. Preserve text/reasoning and supported static/dynamic tool parts. */
export function filterUnsupportedToolCalls<M extends UIMessage>(
  messages: M[],
  activeTools: readonly string[],
): M[] {
  const selected = new Set(activeTools);
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    return {
      ...message,
      parts: message.parts.filter((part) => {
        if (part.type === "dynamic-tool") return selected.has(part.toolName);
        if (part.type.startsWith("tool-"))
          return selected.has(part.type.slice(5));
        return true;
      }),
    };
  });
}
