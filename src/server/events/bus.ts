import { createLogger } from "@/lib/logger";

const log = createLogger("event-bus");

export type EventPayload = {
  "payment:succeeded": {
    paymentId: string;
    orderId: string;
    userId: string;
    gateway: string;
    amountCents: number;
    currency: string;
    productType: string;
  };
  "payment:failed": {
    paymentId: string;
    orderId: string;
    userId: string;
    gateway: string;
    failureReason?: string;
  };
  "payment:refunded": {
    paymentId: string;
    gateway: string;
  };
  "subscription:renewed": {
    subscriptionId: string;
    userId: string;
    cycleNumber: number;
    amountCents: number;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
  };
  "subscription:canceled": {
    subscriptionId: string;
    userId: string;
    cancelAtPeriodEnd: boolean;
  };
  "subscription:invoice_failed": {
    subscriptionId: string;
    userId: string;
    amountCents: number;
  };
  "order:fulfilled": {
    orderId: string;
    userId: string;
    paymentId: string;
  };
  "user:signup": {
    userId: string;
  };
  "fraud:efw": {
    warning: unknown;
  };
};

type Handler<T> = (payload: T) => Promise<void>;

class AppEventBus {
  private listeners = new Map<string, Array<Handler<unknown>>>();

  on<K extends keyof EventPayload>(
    event: K,
    handler: Handler<EventPayload[K]>,
  ): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Handler<unknown>);
    this.listeners.set(event, handlers);
  }

  async emit<K extends keyof EventPayload>(
    event: K,
    payload: EventPayload[K],
  ): Promise<void> {
    const handlers = this.listeners.get(event);
    if (!handlers?.length) return;

    const results = await Promise.allSettled(
      handlers.map((handler) => handler(payload)),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        log.warn(
          { event, error: result.reason },
          "Event handler failed (isolated)",
        );
      }
    }
  }

  /** Remove all listeners — useful for tests */
  clear(): void {
    this.listeners.clear();
  }
}

export const appEvents = new AppEventBus();
