import { Queue } from "bullmq";
import { redis } from "@/server/redis";
import { queueTelemetry } from "@/server/telemetry/queue";

export type AgentExecutionJob =
  | { type: "execute"; runId: string }
  | { type: "recover" };
export const agentExecutionQueue = new Queue<AgentExecutionJob>(
  "agent-execution",
  {
    connection: redis,
    telemetry: queueTelemetry(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  },
);

export async function enqueueAgentRun(runId: string) {
  const existing = await agentExecutionQueue.getJob(runId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed")
      await existing.retry(state);
    return;
  }
  await agentExecutionQueue.add(
    "execute",
    { type: "execute", runId },
    { jobId: runId },
  );
}
