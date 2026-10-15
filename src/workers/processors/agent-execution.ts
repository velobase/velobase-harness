import type { Job } from "bullmq";
import { executeAgentRun, recoverAgentRuns } from "@/server/agents/service";
import { registerChatExecutor } from "@/server/ai-chat/executor";
import { createLogger } from "@/lib/logger";
import {
  agentExecutionQueue,
  type AgentExecutionJob,
} from "../queues/agent-execution.queue";
import { defineRepeatableScheduler } from "../scheduler";

export async function processAgentExecution(job: Job<AgentExecutionJob>) {
  registerChatExecutor();
  if (job.data.type === "recover") await recoverAgentRuns();
  else await executeAgentRun(job.data.runId);
}

export const agentRecoveryScheduler =
  defineRepeatableScheduler<AgentExecutionJob>({
    id: "platform.agent-recovery",
    queue: agentExecutionQueue,
    jobName: "recover",
    data: { type: "recover" },
    options: { jobId: "agent-recovery", repeat: { every: 15_000 } },
    logger: createLogger("agent-recovery"),
    readyMessage: "Agent recovery scheduler ready",
  });
