import { type Prisma, type AgentRun } from "@prisma/client";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import {
  AgentExecutionError,
  AgentExecutionSuspended,
  getAgentExecutor,
} from "./registry";

const log = createLogger("agent-execution");
const LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;
export const activeRunStatuses = ["QUEUED", "RUNNING", "SUSPENDED"] as const;

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function lockExecutionTarget(
  tx: Prisma.TransactionClient,
  serialKey: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serialKey}))`;
}

/** Called inside the same transaction that accepts the domain input. */
export async function acceptAgentRun(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    executor: string;
    serialKey: string;
    actorKey: string;
    requestKey: string;
    requestHash: string;
    input: Prisma.InputJsonValue;
  },
) {
  await lockExecutionTarget(tx, input.serialKey);
  const existing = await tx.agentRun.findUnique({
    where: { requestKey: input.requestKey },
  });
  if (existing) {
    if (
      existing.actorKey !== input.actorKey ||
      existing.requestHash !== input.requestHash
    )
      throw new AgentExecutionError("REQUEST_CONFLICT");
    return existing;
  }
  return tx.agentRun.create({ data: input });
}

export async function notifyAgentRun(runId: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const notification = (async () => {
      const { enqueueAgentRun } =
        await import("@/workers/queues/agent-execution.queue");
      await enqueueAgentRun(runId);
    })();
    await Promise.race([
      notification,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new AgentExecutionError("QUEUE_UNAVAILABLE")),
          1000,
        );
      }),
    ]);
  } catch {
    // Acceptance is durable even when Redis cannot acknowledge this notification.
    log.warn({ runId }, "Agent queue notification deferred to recovery");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function claim(runId: string) {
  return db.$transaction(async (tx) => {
    const candidate = await tx.agentRun.findUnique({ where: { id: runId } });
    if (!candidate) return null;
    await lockExecutionTarget(tx, candidate.serialKey);
    const now = new Date();
    // Revoke expired writers before considering a new claim on this target.
    const expired = await tx.agentRun.findMany({
      where: {
        serialKey: candidate.serialKey,
        status: "RUNNING",
        leaseUntil: { lte: now },
      },
    });
    for (const run of expired) {
      // A renewal can commit after the scan. Recheck expiry under the row lock.
      const revoked = await tx.agentRun.updateMany({
        where: {
          id: run.id,
          epoch: run.epoch,
          status: "RUNNING",
          leaseUntil: { lte: now },
        },
        data: {
          status: run.attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
          errorCode: "LEASE_EXPIRED",
          leaseUntil: null,
          usageUncertain: true,
          nextAttemptAt: now,
        },
      });
      if (revoked.count)
        await tx.agentAttempt.updateMany({
          where: { runId: run.id, epoch: run.epoch, finishedAt: null },
          data: { finishedAt: now, errorCode: "LEASE_EXPIRED" },
        });
    }
    const running = await tx.agentRun.findFirst({
      where: { serialKey: candidate.serialKey, status: "RUNNING" },
    });
    if (running) return null;
    // FIFO includes suspended dependencies: newer input cannot overtake them.
    const first = await tx.agentRun.findFirst({
      where: {
        serialKey: candidate.serialKey,
        status: { in: ["QUEUED", "SUSPENDED"] },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (first?.id !== runId || first.nextAttemptAt > now) return null;
    if (first.attempts >= MAX_ATTEMPTS) {
      await tx.agentRun.update({
        where: { id: runId },
        data: { status: "FAILED", errorCode: "RETRY_LIMIT" },
      });
      return null;
    }
    const run = await tx.agentRun.update({
      where: { id: runId },
      data: {
        status: "RUNNING",
        epoch: { increment: 1 },
        attempts: { increment: 1 },
        leaseUntil: new Date(Date.now() + LEASE_MS),
        errorCode: null,
      },
    });
    await tx.agentAttempt.create({ data: { runId, epoch: run.epoch } });
    return run;
  });
}

async function finish(
  run: AgentRun,
  status: "SUCCEEDED" | "FAILED" | "SUSPENDED",
  errorCode?: string,
  nextAttemptAt?: Date,
) {
  await db.$transaction(async (tx) => {
    const changed = await tx.agentRun.updateMany({
      where: {
        id: run.id,
        status: "RUNNING",
        epoch: run.epoch,
        leaseUntil: { gt: new Date() },
      },
      data: {
        status,
        leaseUntil: null,
        errorCode: errorCode ?? null,
        ...(nextAttemptAt && { nextAttemptAt }),
        ...(status === "FAILED" && { usageUncertain: true }),
        // Waiting for a dependency does not exhaust the failure retry budget.
        ...(status === "SUSPENDED" && { attempts: { decrement: 1 } }),
      },
    });
    if (changed.count)
      await tx.agentAttempt.updateMany({
        where: { runId: run.id, epoch: run.epoch, finishedAt: null },
        data: { finishedAt: new Date(), errorCode: errorCode ?? null },
      });
  });
}

export async function executeAgentRun(runId: string) {
  const run = await claim(runId);
  if (!run) return;
  const controller = new AbortController();
  let renewing = false;
  let pendingRenewal = Promise.resolve();
  let executor;
  try {
    executor = getAgentExecutor(run.executor);
  } catch {
    await finish(run, "FAILED", "EXECUTOR_UNAVAILABLE");
    return;
  }
  const check = async () => {
    if (controller.signal.aborted)
      throw (controller.signal.reason as unknown) instanceof AgentExecutionError
        ? controller.signal.reason
        : new AgentExecutionError("EXECUTION_STOPPED");
    const valid = await db.agentRun.count({
      where: {
        id: run.id,
        epoch: run.epoch,
        status: "RUNNING",
        leaseUntil: { gt: new Date() },
      },
    });
    if (!valid) throw new AgentExecutionError("LEASE_LOST");
    await executor.authorize(run);
  };
  const heartbeat = setInterval(() => {
    if (renewing) return;
    renewing = true;
    pendingRenewal = (async () => {
      try {
        await executor.authorize(run);
        const renewed = await db.agentRun.updateMany({
          where: {
            id: run.id,
            status: "RUNNING",
            epoch: run.epoch,
            leaseUntil: { gt: new Date() },
          },
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        });
        if (!renewed.count)
          controller.abort(new AgentExecutionError("LEASE_LOST"));
      } catch (error) {
        controller.abort(error);
      } finally {
        renewing = false;
      }
    })();
  }, 5_000);
  const timeout = setTimeout(
    () => controller.abort(new AgentExecutionError("EXECUTION_TIMEOUT")),
    15 * 60_000,
  );
  try {
    await check();
    await executor.execute({
      run,
      signal: controller.signal,
      check,
      commit: async (write) => {
        await check();
        return db.$transaction(async (tx) => {
          const locked = await tx.agentRun.updateMany({
            where: {
              id: run.id,
              epoch: run.epoch,
              status: "RUNNING",
              leaseUntil: { gt: new Date() },
            },
            data: { epoch: { increment: 0 } },
          });
          if (!locked.count) throw new AgentExecutionError("LEASE_LOST");
          return write(tx);
        });
      },
    });
    await check();
    await finish(run, "SUCCEEDED");
  } catch (caught) {
    const error = controller.signal.aborted
      ? (controller.signal.reason as unknown)
      : caught;
    if (error instanceof AgentExecutionSuspended) {
      await finish(run, "SUSPENDED", error.code, error.retryAt);
    } else {
      const code =
        error instanceof AgentExecutionError ? error.code : "EXECUTION_FAILED";
      await finish(run, "FAILED", code);
      log.warn({ runId: run.id, code }, "Agent execution stopped");
    }
  } finally {
    clearInterval(heartbeat);
    clearTimeout(timeout);
    await pendingRenewal;
    await settleAgentRun(runId);
  }
}

export async function cancelAgentRun(runId: string, actorKey: string) {
  return db.$transaction(async (tx) => {
    const candidate = await tx.agentRun.findUnique({ where: { id: runId } });
    if (candidate?.actorKey !== actorKey)
      throw new AgentExecutionError("NOT_FOUND");
    await lockExecutionTarget(tx, candidate.serialKey);
    const run = await tx.agentRun.findUniqueOrThrow({ where: { id: runId } });
    const result = await tx.agentRun.updateMany({
      where: { id: runId, actorKey, status: { in: [...activeRunStatuses] } },
      data: {
        status: "CANCELLED",
        usageUncertain: run.status === "RUNNING" || run.usageUncertain,
        epoch: { increment: 1 },
        leaseUntil: null,
        errorCode: "CANCELLED",
      },
    });
    if (result.count) {
      await tx.agentAttempt.updateMany({
        where: { runId, finishedAt: null },
        data: { finishedAt: new Date(), errorCode: "CANCELLED" },
      });
      await tx.agentToolOperation.updateMany({
        where: { runId, status: "RUNNING" },
        data: { status: "UNKNOWN" },
      });
    }
    return { cancelled: result.count === 1 };
  });
}

export async function settleAgentRun(runId: string) {
  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (
    !run ||
    run.settledAt ||
    activeRunStatuses.includes(run.status as (typeof activeRunStatuses)[number])
  )
    return;
  try {
    await getAgentExecutor(run.executor).settle?.(run);
    await db.agentRun.update({
      where: { id: runId },
      data: { settledAt: new Date() },
    });
  } catch {
    await db.agentRun.update({
      where: { id: runId },
      data: { updatedAt: new Date() },
    });
    log.warn({ runId }, "Agent settlement pending recovery");
  }
}

export async function recoverAgentRuns() {
  const now = new Date();
  const due = await db.agentRun.findMany({
    where: {
      OR: [
        {
          status: { in: ["QUEUED", "SUSPENDED"] },
          nextAttemptAt: { lte: now },
        },
        { status: "RUNNING", leaseUntil: { lte: now } },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 100,
    select: { id: true },
  });
  for (const run of due) {
    await notifyAgentRun(run.id);
    // Rotate the bounded scan even when this target is blocked behind another run.
    await db.agentRun.updateMany({
      where: { id: run.id },
      data: { updatedAt: new Date() },
    });
  }
  const unsettled = await db.agentRun.findMany({
    where: {
      status: { in: ["SUCCEEDED", "FAILED", "CANCELLED"] },
      settledAt: null,
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 20,
    select: { id: true },
  });
  for (const run of unsettled) await settleAgentRun(run.id);
}
