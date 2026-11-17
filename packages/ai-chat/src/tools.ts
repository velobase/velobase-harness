import { z } from "zod";

export type UIMessageDataPart<
  DATA_PARTS extends Record<string, unknown> = Record<string, unknown>,
> = {
  [K in keyof DATA_PARTS & string]: {
    type: `data-${K}`;
    id?: string;
    data: DATA_PARTS[K];
  };
}[keyof DATA_PARTS & string];

export type UIMessageToolPart =
  | {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      state:
        | "input-streaming"
        | "input-available"
        | "output-available"
        | "output-error";
      input?: unknown;
      output?: unknown;
      errorText?: string;
    }
  | {
      type: `tool-${string}`;
      toolCallId: string;
      state?:
        | "input-streaming"
        | "input-available"
        | "output-available"
        | "output-error";
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

export type UIMessagePart<
  DATA_PARTS extends Record<string, unknown> = Record<string, unknown>,
> =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; summary?: string }
  | { type: "file"; url: string; filename?: string; mediaType: string }
  | { type: "step-start" }
  | UIMessageToolPart
  | UIMessageDataPart<DATA_PARTS>;

export interface UIMessage<
  METADATA = unknown,
  DATA_PARTS extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  role: "system" | "user" | "assistant";
  parts: Array<UIMessagePart<DATA_PARTS>>;
  metadata?: METADATA;
}

export function isToolUIPart(part: unknown): part is UIMessageToolPart {
  if (!part || typeof part !== "object" || !("type" in part)) return false;
  const type = (part as { type: unknown }).type;
  return (
    type === "dynamic-tool" ||
    (typeof type === "string" && type.startsWith("tool-"))
  );
}

export function getToolName(
  part: UIMessageToolPart | { type: string; toolName?: string },
): string {
  if (part.type === "dynamic-tool") {
    return (part as { toolName?: string }).toolName ?? "";
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return "";
}

export interface ToolCallOptions {
  toolCallId: string;
  messages?: unknown[];
  abortSignal?: AbortSignal;
  experimental_context?: Record<string, unknown>;
}

export interface ChatTool<TInput = unknown, TOutput = unknown> {
  description: string;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  execute?(input: TInput, options: ToolCallOptions): Promise<TOutput> | TOutput;
}

export type ToolSet = Record<string, ChatTool>;

export function defineChatTool<
  TInput = Record<string, never>,
  TOutput = unknown,
>(definition: ChatTool<TInput, TOutput>): ChatTool<TInput, TOutput> {
  return definition;
}

export { defineChatTool as tool };

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

function isOptionalZodSchema(schema: z.ZodTypeAny): boolean {
  const def = (
    schema as { _def?: { typeName?: string; innerType?: z.ZodTypeAny } }
  )._def;
  const typeName = def?.typeName;
  if (typeName === "ZodOptional" || typeName === "ZodDefault") {
    return true;
  }
  if (typeName === "ZodEffects" && def?.innerType) {
    return isOptionalZodSchema(def.innerType);
  }
  if (typeName === "ZodNullable" && def?.innerType) {
    return isOptionalZodSchema(def.innerType);
  }
  return false;
}

/** Convert a Zod schema into a JSON Schema object accepted by Pi Durable and @earendil-works/pi-schema. */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = (
    schema as {
      description?: string;
      _def?: {
        typeName?: string;
        description?: string;
        shape?: () => Record<string, z.ZodTypeAny>;
        innerType?: z.ZodTypeAny;
        schema?: z.ZodTypeAny;
        type?: z.ZodTypeAny;
        valueType?: z.ZodTypeAny;
        values?: readonly string[] | Record<string, string | number>;
        value?: unknown;
        options?: readonly z.ZodTypeAny[];
        checks?: Array<{ kind: string; value?: number }>;
      };
    }
  )._def;

  const description = schema.description ?? def?.description;
  const withDesc = (base: Record<string, unknown>): Record<string, unknown> =>
    description ? { ...base, description } : base;

  const typeName = def?.typeName;
  switch (typeName) {
    case "ZodEffects":
      return withDesc(zodToJsonSchema(def!.schema!));
    case "ZodOptional":
    case "ZodDefault":
      return withDesc(zodToJsonSchema(def!.innerType!));
    case "ZodNullable": {
      const inner = zodToJsonSchema(def!.innerType!);
      return withDesc({ anyOf: [inner, { type: "null" }] });
    }
    case "ZodObject": {
      const shape = def?.shape ? def.shape() : {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, fieldSchema] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(fieldSchema);
        if (!isOptionalZodSchema(fieldSchema)) {
          required.push(key);
        }
      }
      return withDesc({
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      });
    }
    case "ZodString":
      return withDesc({ type: "string" });
    case "ZodNumber": {
      const isInt = def?.checks?.some((c) => c.kind === "int") ?? false;
      return withDesc({ type: isInt ? "integer" : "number" });
    }
    case "ZodBoolean":
      return withDesc({ type: "boolean" });
    case "ZodEnum":
      return withDesc({
        type: "string",
        enum: Array.isArray(def?.values) ? [...def.values] : [],
      });
    case "ZodNativeEnum":
      return withDesc({
        type: "string",
        enum: def?.values ? Object.values(def.values) : [],
      });
    case "ZodLiteral":
      return withDesc({
        const: def?.value,
        ...(typeof def?.value === "string" ||
        typeof def?.value === "number" ||
        typeof def?.value === "boolean"
          ? { type: typeof def.value }
          : {}),
      });
    case "ZodArray":
      return withDesc({
        type: "array",
        items: def?.type ? zodToJsonSchema(def.type) : {},
      });
    case "ZodRecord":
      return withDesc({
        type: "object",
        additionalProperties: def?.valueType
          ? zodToJsonSchema(def.valueType)
          : true,
      });
    case "ZodUnion":
    case "ZodDiscriminatedUnion":
      return withDesc({
        anyOf: (def?.options ?? []).map((opt) => zodToJsonSchema(opt)),
      });
    default:
      return withDesc({});
  }
}
