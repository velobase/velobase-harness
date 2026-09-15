import type { Job, Queue } from "bullmq";

export type WorkerProcessor<T = unknown> = {
  bivarianceHack(job: Job<T>, token?: string): Promise<void>;
}["bivarianceHack"];

export interface WorkerRegisterOptions {
  concurrency?: number;
  lockDuration?: number;
}

export interface SchedulerContribution {
  id: string;
  queue?: Queue;
  register: () => Promise<void>;
  remove?: () => Promise<void>;
}

export interface WorkerContribution<T = unknown> {
  id: string;
  queue: Queue;
  processor: WorkerProcessor<T>;
  options?: WorkerRegisterOptions;
  scheduler?: SchedulerContribution;
}
