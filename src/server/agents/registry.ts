import type { AgentRun, Prisma } from "@prisma/client";

export class AgentExecutionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AgentExecutionError";
  }
}

export class AgentExecutionSuspended extends AgentExecutionError {
  constructor(
    code: string,
    public readonly retryAt = new Date(Date.now() + 30_000),
  ) {
    super(code);
  }
}

export interface AgentExecutionContext {
  run: AgentRun;
  signal: AbortSignal;
  check: () => Promise<void>;
  commit: <T>(
    write: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
}

export interface AgentExecutor {
  authorize: (run: AgentRun) => Promise<void>;
  execute: (context: AgentExecutionContext) => Promise<void>;
  settle?: (run: AgentRun) => Promise<void>;
}

const executors = new Map<string, AgentExecutor>();

/** Host registration binds code, never model-controlled names or imports. */
export function registerAgentExecutor(key: string, executor: AgentExecutor) {
  const existing = executors.get(key);
  if (existing && existing !== executor)
    throw new Error(`Duplicate Agent executor: ${key}`);
  executors.set(key, executor);
}

export function getAgentExecutor(key: string) {
  const executor = executors.get(key);
  if (!executor) throw new AgentExecutionError("EXECUTOR_UNAVAILABLE");
  return executor;
}
