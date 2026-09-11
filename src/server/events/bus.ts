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
    eventId?: string;
  };
  "invoice:refunded": {
    invoiceId: string;
    gateway: string;
    eventId: string;
  };
  "subscription:renewed": {
    invoiceId: string;
    subscriptionId: string;
    userId: string;
    cycleNumber: number;
    amountCents: number;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
  };
  "subscription:cycle-created": {
    cycleId: string;
    subscriptionId: string;
    userId: string;
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
    referralCode?: string;
  };
  "fraud:efw": {
    warning: unknown;
  };
  "image_generation:succeeded": {
    taskId: string;
    userId: string;
    provider: string;
    model: string;
    assetIds: string[];
  };
  "image_generation:failed": {
    taskId: string;
    userId: string;
    provider: string;
    model: string;
    errorMessage?: string;
  };
};

type Handler<T> = (payload: T) => Promise<void>;

export class AppEventBus {
  private listeners = new Map<string, Array<Handler<unknown>>>();
  private disposers: Array<() => void> = [];
  constructor(
    private readonly parent?: AppEventBus,
    private readonly allowed?: (event: keyof EventPayload) => Promise<boolean>,
  ) {}

  scope(allowed: (event: keyof EventPayload) => Promise<boolean>): AppEventBus {
    return new AppEventBus(this, allowed);
  }

  on<K extends keyof EventPayload>(
    event: K,
    handler: Handler<EventPayload[K]>,
  ): () => void {
    if (this.parent) {
      const dispose = this.parent.on(event, async (payload) => {
        if (!this.allowed || (await this.allowed(event)))
          await handler(payload);
      });
      this.disposers.push(dispose);
      return dispose;
    }
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Handler<unknown>);
    this.listeners.set(event, handlers);
    return () => {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((entry) => entry !== handler),
      );
    };
  }

  async emit<K extends keyof EventPayload>(
    event: K,
    payload: EventPayload[K],
  ): Promise<void> {
    if (this.parent) return this.parent.emit(event, payload);
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
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.listeners.clear();
  }
}

export const appEvents = new AppEventBus();
