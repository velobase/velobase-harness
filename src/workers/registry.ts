/**
 * Worker Registry
 *
 * Centralized management of BullMQ workers, queues, and schedulers.
 * Eliminates repetitive boilerplate in `index.ts` by providing a
 * declarative registration API and automatic lifecycle management.
 */
import type { Queue } from "bullmq";
import type { Job } from "bullmq";
import type { Worker } from "bullmq";
import { createWorkerInstance } from "./utils/create-worker";
import { createLogger } from "@/lib/logger";

const log = createLogger("worker-registry");

type ProcessorFunction<T = unknown> = (job: Job<T>) => Promise<void>;

interface WorkerEntry {
  name: string;
  worker: Worker;
  queue: Queue;
}

interface RegisterOptions {
  concurrency?: number;
  lockDuration?: number;
}

export class WorkerRegistry {
  private entries: WorkerEntry[] = [];
  private schedulers: Array<() => Promise<void>> = [];

  /**
   * Register a queue + worker pair. The queue instance must already exist
   * (created in the corresponding `*.queue.ts` file).
   */
  register<T>(
    queue: Queue<T>,
    processor: ProcessorFunction<T>,
    options?: RegisterOptions,
  ): void {
    const worker = createWorkerInstance(queue.name, processor, options ?? {});
    this.entries.push({ name: queue.name, worker, queue: queue as Queue });
  }

  /**
   * Register a scheduler function to be called during startup.
   */
  registerScheduler(fn: () => Promise<void>): void {
    this.schedulers.push(fn);
  }

  /**
   * Return all registered queues (for Bull Board, etc.).
   */
  getQueues(): Queue[] {
    return this.entries.map((e) => e.queue);
  }

  /**
   * Run all registered scheduler functions.
   */
  async startAll(): Promise<void> {
    for (const fn of this.schedulers) {
      await fn();
    }
    log.info(
      { workers: this.entries.length, schedulers: this.schedulers.length },
      "All workers and schedulers started",
    );
  }

  /**
   * Gracefully shut down all workers, queues, and the shared Redis connection.
   */
  async shutdown(): Promise<void> {
    for (const { name, worker } of this.entries) {
      await worker.close();
      log.info({ queue: name }, "Worker closed");
    }

    for (const { name, queue } of this.entries) {
      await queue.close();
      log.info({ queue: name }, "Queue closed");
    }
  }
}
