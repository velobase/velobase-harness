import { z } from "zod";

export const subscriptionsFeature = {
  id: "subscriptions",
  category: "business",
  dependencies: ["payments"],
  defaultEnabled: false,
} as const;
const idSchema = z.string().min(1).max(256);
const gatewaySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .transform((v) => v.toUpperCase());
export const subscriptionStatusSchema = z.enum([
  "UNDEFINED",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "UNPAID",
  "PAUSED",
  "CANCELED",
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type CycleType = "UNDEFINED" | "REGULAR" | "TRIAL";
export type CycleStatus = "UNDEFINED" | "ACTIVE" | "CLOSED";
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);
export const subscriptionDraftSchema = z.object({
  userId: idSchema,
  planId: idSchema,
  planSnapshot: jsonValueSchema,
  gateway: gatewaySchema,
  gatewaySubscriptionId: z.string().max(256).default(""),
  cancelAtPeriodEnd: z.boolean().default(false),
});
export const cycleDraftSchema = z
  .object({
    subscriptionId: idSchema,
    paymentId: idSchema.optional(),
    uniqueKey: z.string().min(1).max(512),
    type: z.enum(["REGULAR", "TRIAL"]),
    startsAt: z.date(),
    expiresAt: z.date(),
  })
  .refine((v) => v.expiresAt > v.startsAt, {
    message: "A subscription period must end after it starts",
    path: ["expiresAt"],
  });
export type SubscriptionDraft = z.output<typeof subscriptionDraftSchema>;
export type CycleDraft = z.output<typeof cycleDraftSchema>;
export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: string;
  planSnapshot: JsonValue;
  status: SubscriptionStatus;
  gateway: string;
  gatewaySubscriptionId: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
  deletedAt: Date | null;
  revision: string;
}
export interface SubscriptionCycle {
  id: string;
  subscriptionId: string;
  paymentId: string | null;
  uniqueKey: string | null;
  type: CycleType;
  status: CycleStatus;
  sequenceNumber: number;
  startsAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
}
export const providerStateSchema = z.object({
  gatewaySubscriptionId: idSchema,
  status: subscriptionStatusSchema,
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.date().nullable(),
  endedAt: z.date().nullable(),
  periodStart: z.date().optional(),
  periodEnd: z.date().optional(),
});
export type ProviderSubscriptionState = z.output<typeof providerStateSchema>;
export interface SubscriptionProvider {
  getSubscription(id: string): Promise<ProviderSubscriptionState>;
  /** Confirm the remote desired state. Throw when the result cannot be established. This is not a refund API. */
  cancelSubscription(
    id: string,
    atPeriodEnd: boolean,
  ): Promise<ProviderSubscriptionState>;
  convertTrial?(id: string): Promise<void>;
}
export interface SubscriptionPatch {
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
}
export interface SubscriptionTransaction<
  S extends SubscriptionRecord,
  C extends SubscriptionCycle,
> {
  get(id: string): Promise<S | null>;
  findByGateway(
    gateway: string,
    gatewaySubscriptionId: string,
  ): Promise<S | null>;
  /** The host defines which non-recurring gateways may reuse an existing manual membership. */
  findManual(draft: SubscriptionDraft): Promise<S | null>;
  create(draft: SubscriptionDraft): Promise<S>;
  cycleByKey(key: string): Promise<C | null>;
  latestSequence(subscriptionId: string): Promise<number>;
  createCycle(draft: CycleDraft, sequenceNumber: number): Promise<C>;
  /** Compare revision; closing cycles and state must be atomic when immediate cancellation is confirmed. */
  update(
    current: S,
    patch: SubscriptionPatch,
    closeCycles: boolean,
  ): Promise<S | null>;
}
export interface SubscriptionRepository<
  S extends SubscriptionRecord,
  C extends SubscriptionCycle,
> {
  /** Serialize the scope; never perform provider I/O inside the transaction. */
  transaction<T>(
    scope: { kind: "customer" | "subscription"; id: string },
    work: (tx: SubscriptionTransaction<S, C>) => Promise<T>,
  ): Promise<T>;
  get(id: string): Promise<S | null>;
  /** Choose the host's current eligible relationship. Billing state alone is not proof of an entitlement. */
  findCurrent(userId: string): Promise<S | null>;
  currentCycle(subscriptionId: string, now: Date): Promise<C | null>;
  list(input: {
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: S[]; nextCursor?: string }>;
}
export class SubscriptionsError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "CONFLICT"
      | "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}
function owned<S extends SubscriptionRecord>(
  record: S | null,
  userId: string,
): S {
  if (!record || record.deletedAt || record.userId !== userId)
    throw new SubscriptionsError("NOT_FOUND", "Subscription not found");
  return record;
}
function terminal(status: SubscriptionStatus) {
  return status === "CANCELED" || status === "INCOMPLETE_EXPIRED";
}
export function hasCurrentCycle(
  cycle: SubscriptionCycle | null,
  now = new Date(),
) {
  return Boolean(
    cycle &&
    !cycle.deletedAt &&
    cycle.status === "ACTIVE" &&
    cycle.startsAt <= now &&
    cycle.expiresAt > now,
  );
}

export function createSubscriptions<
  S extends SubscriptionRecord,
  C extends SubscriptionCycle,
>(options: {
  repository: SubscriptionRepository<S, C>;
  isEnabled(): Promise<boolean>;
  provider(
    gateway: string,
    subscription: S,
  ): SubscriptionProvider | Promise<SubscriptionProvider>;
  isManualGateway?(gateway: string): boolean;
  onCycleCreated?(cycle: C, subscription: S): Promise<void>;
}) {
  const { repository } = options;
  async function requireEnabled() {
    if (!(await options.isEnabled()))
      throw new SubscriptionsError(
        "UNAVAILABLE",
        "New subscriptions are disabled",
      );
  }
  async function settleCreate(input: unknown) {
    const draft = subscriptionDraftSchema.parse(input);
    if (
      !draft.gatewaySubscriptionId &&
      !options.isManualGateway?.(draft.gateway)
    )
      throw new SubscriptionsError(
        "BAD_REQUEST",
        "An automatic subscription requires its provider identity",
      );
    return repository.transaction(
      { kind: "customer", id: draft.userId },
      async (tx) => {
        const previous = draft.gatewaySubscriptionId
          ? await tx.findByGateway(draft.gateway, draft.gatewaySubscriptionId)
          : await tx.findManual(draft);
        if (previous) {
          if (
            previous.userId !== draft.userId ||
            previous.planId !== draft.planId ||
            previous.deletedAt
          )
            throw new SubscriptionsError(
              "CONFLICT",
              "Subscription identity is already associated with another record",
            );
          return previous;
        }
        return tx.create(draft);
      },
    );
  }
  async function settleCycle(input: unknown) {
    const draft = cycleDraftSchema.parse(input);
    const settled = await repository.transaction(
      { kind: "subscription", id: draft.subscriptionId },
      async (tx) => {
        const subscription = await tx.get(draft.subscriptionId);
        if (!subscription || subscription.deletedAt)
          throw new SubscriptionsError("NOT_FOUND", "Subscription not found");
        const existing = await tx.cycleByKey(draft.uniqueKey);
        if (existing) {
          if (
            existing.subscriptionId !== draft.subscriptionId ||
            existing.type !== draft.type ||
            (existing.paymentId ?? undefined) !== draft.paymentId ||
            existing.deletedAt
          )
            throw new SubscriptionsError(
              "CONFLICT",
              "Period identity was used for a different subscription or payment",
            );
          // The original paid period is authoritative. Retries must use its dates for downstream delivery.
          return { cycle: existing, subscription };
        }
        const sequence = await tx.latestSequence(subscription.id);
        const cycle = await tx.createCycle(draft, sequence + 1);
        return { cycle, subscription };
      },
    );
    await options.onCycleCreated?.(settled.cycle, settled.subscription);
    return settled.cycle;
  }
  async function applySnapshot(
    initial: S,
    evidence: ProviderSubscriptionState,
    closeCycles: boolean,
  ) {
    const state = providerStateSchema.parse(evidence);
    if (state.gatewaySubscriptionId !== initial.gatewaySubscriptionId)
      throw new SubscriptionsError(
        "CONFLICT",
        "Provider subscription identity does not match",
      );
    return repository.transaction(
      { kind: "subscription", id: initial.id },
      async (tx) => {
        const current = await tx.get(initial.id);
        if (!current || current.deletedAt)
          throw new SubscriptionsError("NOT_FOUND", "Subscription not found");
        if (
          current.revision !== initial.revision ||
          current.gateway !== initial.gateway ||
          current.gatewaySubscriptionId !== initial.gatewaySubscriptionId
        )
          throw new SubscriptionsError(
            "CONFLICT",
            "Subscription changed; fetch provider state again",
          );
        if (terminal(current.status) && !terminal(state.status))
          throw new SubscriptionsError(
            "CONFLICT",
            "A terminal subscription cannot be revived by a late snapshot",
          );
        const patch: SubscriptionPatch = {
          status: state.status,
          cancelAtPeriodEnd: state.cancelAtPeriodEnd,
          canceledAt: state.canceledAt,
          endedAt: state.endedAt,
        };
        const updated = await tx.update(
          current,
          patch,
          closeCycles && state.status === "CANCELED",
        );
        if (!updated)
          throw new SubscriptionsError(
            "CONFLICT",
            "Subscription changed while recording provider state",
          );
        return updated;
      },
    );
  }
  return {
    /** Explicit new enrollment. Paid/accepted settlement uses settleCreate instead. */
    async create(input: unknown) {
      await requireEnabled();
      return settleCreate(input);
    },
    settleCreate,
    /** Trusted accepted period only. Creation does not itself deliver credits, products or access. */
    settleCycle,
    async createCycle(input: unknown) {
      await requireEnabled();
      return settleCycle(input);
    },
    async get(userId: string, id: string) {
      return owned(
        await repository.get(idSchema.parse(id)),
        idSchema.parse(userId),
      );
    },
    async current(userId: string) {
      const subscription = await repository.findCurrent(idSchema.parse(userId));
      if (!subscription || subscription.deletedAt) return null;
      owned(subscription, userId);
      const now = new Date();
      const cycle = await repository.currentCycle(subscription.id, now);
      return {
        subscription,
        cycle: hasCurrentCycle(cycle, now) ? cycle : null,
      };
    },
    list(userId: string, input: unknown) {
      const data = z
        .object({
          cursor: idSchema.optional(),
          limit: z.number().int().min(1).max(100).default(20),
        })
        .parse(input);
      return repository.list({ ...data, userId: idSchema.parse(userId) });
    },
    /** Host must authorize Admin before using this reader. */
    listForAdmin(input: unknown) {
      return repository.list(
        z
          .object({
            userId: idSchema.optional(),
            cursor: idSchema.optional(),
            limit: z.number().int().min(1).max(100).default(20),
          })
          .parse(input),
      );
    },
    /** Read existing billing state without a new-enrollment gate. */
    async refresh(userId: string, id: string) {
      const initial = owned(
        await repository.get(idSchema.parse(id)),
        idSchema.parse(userId),
      );
      if (options.isManualGateway?.(initial.gateway)) return initial;
      if (!initial.gatewaySubscriptionId)
        throw new SubscriptionsError(
          "CONFLICT",
          "Provider identity is missing",
        );
      const provider = await options.provider(initial.gateway, initial);
      return applySnapshot(
        initial,
        await provider.getSubscription(initial.gatewaySubscriptionId),
        true,
      );
    },
    /** Cancellation is always available for owned existing work; it never initiates a refund. */
    async cancel(userId: string, id: string, input: unknown) {
      const { atPeriodEnd } = z
        .object({ atPeriodEnd: z.boolean().default(true) })
        .parse(input);
      const initial = owned(
        await repository.get(idSchema.parse(id)),
        idSchema.parse(userId),
      );
      if (options.isManualGateway?.(initial.gateway)) {
        return repository.transaction(
          { kind: "subscription", id: initial.id },
          async (tx) => {
            const current = owned(await tx.get(initial.id), userId);
            const now = new Date();
            const updated = await tx.update(
              current,
              {
                status: atPeriodEnd ? current.status : "CANCELED",
                cancelAtPeriodEnd: atPeriodEnd && !terminal(current.status),
                canceledAt: current.canceledAt ?? now,
                endedAt: atPeriodEnd
                  ? current.endedAt
                  : (current.endedAt ?? now),
              },
              !atPeriodEnd,
            );
            if (!updated)
              throw new SubscriptionsError(
                "CONFLICT",
                "Subscription changed during cancellation",
              );
            return updated;
          },
        );
      }
      if (!initial.gatewaySubscriptionId)
        throw new SubscriptionsError(
          "CONFLICT",
          "Provider identity is missing",
        );
      const provider = await options.provider(initial.gateway, initial);
      const state = providerStateSchema.parse(
        await provider.cancelSubscription(
          initial.gatewaySubscriptionId,
          atPeriodEnd,
        ),
      );
      if (
        atPeriodEnd
          ? !state.cancelAtPeriodEnd && state.status !== "CANCELED"
          : state.status !== "CANCELED"
      )
        throw new SubscriptionsError(
          "CONFLICT",
          "Provider did not confirm the requested cancellation",
        );
      return applySnapshot(initial, state, !atPeriodEnd);
    },
    async convertTrial(userId: string, id: string) {
      await requireEnabled();
      const initial = owned(
        await repository.get(idSchema.parse(id)),
        idSchema.parse(userId),
      );
      const cycle = await repository.currentCycle(initial.id, new Date());
      if (
        !hasCurrentCycle(cycle) ||
        cycle?.type !== "TRIAL" ||
        terminal(initial.status)
      )
        throw new SubscriptionsError(
          "CONFLICT",
          "There is no current trial to convert",
        );
      if (!initial.gatewaySubscriptionId)
        throw new SubscriptionsError(
          "CONFLICT",
          "Provider identity is missing",
        );
      const provider = await options.provider(initial.gateway, initial);
      if (!provider.convertTrial)
        throw new SubscriptionsError(
          "UNAVAILABLE",
          "This provider cannot convert a trial",
        );
      await provider.convertTrial(initial.gatewaySubscriptionId);
    },
  };
}
