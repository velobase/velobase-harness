import { BullMQOtel } from "bullmq-otel";
import { env } from "@/env";

/** Use on both producer and consumer; BullMQ carries W3C context in job options. */
export function queueTelemetry(): BullMQOtel | undefined {
  return env.OTEL_ENABLED === "true"
    ? new BullMQOtel("velobase-harness")
    : undefined;
}
