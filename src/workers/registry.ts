import { DelayedError } from "bullmq";
import { isFeatureEnabled } from "@/server/features/state";
import type { FeatureId } from "@velobase/module-runtime";
/**
 * Worker Registry
 *
 * Centralized management of BullMQ workers, queues, and schedulers.
 * Eliminates repetitive boilerplate in `index.ts` by providing a
 * declarative registration API and automatic lifecycle management.
 */
import type { Queue } from "bullmq";
import type { Worker } from "bullmq";
import { createWorkerInstance } from "./utils/create-worker";
import { createLogger } from "@/lib/logger";
import type {
  SchedulerContribution,
  WorkerContribution,
  WorkerProcessor,
  WorkerRegisterOptions,
} from "./types";

const log = createLogger("worker-registry");

interface WorkerEntry {
  name: string;
  worker: Worker;
  queue: Queue;
}

export class WorkerRegistry {
  private entries: WorkerEntry[] = [];
  private schedulers: SchedulerContribution[] = [];
  private queues = new Set<Queue>();
  private contributionIds = new Set<string>();
  private schedulerIds = new Set<string>();

  /**
   * Register a queue + worker pair. The queue instance must already exist
   * (created in the corresponding `*.queue.ts` file).
   */
  register<T>(
    queue: Queue<T>,
    processor: WorkerProcessor<T>,
    options?: WorkerRegisterOptions,
  ): void {
    const worker = createWorkerInstance(queue.name, processor, options ?? {});
    this.entries.push({ name: queue.name, worker, queue: queue as Queue });
    this.queues.add(queue as Queue);
  }

  /**
   * Register one module-contributed worker capability.
   */
  registerContribution<T>(contribution: WorkerContribution<T>): void {
    if (this.contributionIds.has(contribution.id)) {
      log.info(
        { contribution: contribution.id },
        "Skipping duplicate worker contribution",
      );
      return;
    }

    this.contributionIds.add(contribution.id);
    this.register(
      contribution.queue as Queue<T>,
      async (job, token) => {
        const featureByPrefix: Record<string, FeatureId> = {
          "google-ads": "attribution",
          "conversion-alert": "attribution",
          "support-automation.process": "ai-support",
        };
        const prefix = Object.keys(featureByPrefix).find((entry) =>
          contribution.id.startsWith(entry),
        );
        const feature = prefix ? featureByPrefix[prefix] : undefined;
        if (feature && !(await isFeatureEnabled(feature))) {
          await job.moveToDelayed(Date.now() + 60_000, token);
          throw new DelayedError();
        }
        await contribution.processor(job, token);
      },
      contribution.options,
    );

    if (contribution.scheduler) {
      this.registerScheduler(contribution.scheduler);
    }
  }

  registerContributions(contributions: readonly WorkerContribution[]): void {
    for (const contribution of contributions) {
      this.registerContribution(contribution);
    }
  }

  /**
   * Register a scheduler contribution to be reconciled during startup.
   */
  registerScheduler(scheduler: SchedulerContribution): void {
    if (this.schedulerIds.has(scheduler.id)) {
      log.info({ scheduler: scheduler.id }, "Skipping duplicate scheduler");
      return;
    }

    this.schedulerIds.add(scheduler.id);
    this.schedulers.push(scheduler);
    if (scheduler.queue) {
      this.queues.add(scheduler.queue);
    }
  }

  /**
   * Return all registered queues (for Bull Board, etc.).
   */
  getQueues(): Queue[] {
    return this.entries.map((e) => e.queue);
  }

  /**
   * Remove disabled scheduler state and register enabled scheduler functions.
   */
  async startAll(
    disabledSchedulers: readonly SchedulerContribution[] = [],
  ): Promise<void> {
    for (const scheduler of disabledSchedulers) {
      await scheduler.remove?.();

      if (scheduler.queue && !this.queues.has(scheduler.queue)) {
        await scheduler.queue.close();
      }
    }

    for (const scheduler of this.schedulers) {
      await scheduler.register();
    }
    log.info(
      {
        workers: this.entries.length,
        schedulers: this.schedulers.length,
        disabledSchedulers: disabledSchedulers.length,
      },
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

    for (const queue of this.queues) {
      await queue.close();
      log.info({ queue: queue.name }, "Queue closed");
    }
  }
}
