import {
  Prisma,
  type UserSubscription,
  type UserSubscriptionCycle,
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  createSubscriptions,
  jsonValueSchema,
  SubscriptionsError,
  type JsonValue,
  type SubscriptionRepository,
  type SubscriptionTransaction,
} from "@velobase/subscriptions";
import { createStripeSubscriptionProvider } from "@velobase/subscriptions-stripe";
import { db } from "@/server/db";
import { isFeatureEnabled } from "@/server/features/state";
import { getStripe } from "@/server/order/services/stripe/client";
import { appEvents } from "@/server/events/bus";

type StoredSubscription = Omit<UserSubscription, "planSnapshot"> & {
  planSnapshot: JsonValue;
  revision: string;
};
function subscription(row: UserSubscription): StoredSubscription {
  return {
    ...row,
    planSnapshot: jsonValueSchema.parse(row.planSnapshot),
    revision: row.updatedAt.toISOString(),
  };
}
async function read(
  id: string,
  connection: Pick<typeof db, "userSubscription"> = db,
) {
  const row = await connection.userSubscription.findUnique({ where: { id } });
  return row ? subscription(row) : null;
}
function transaction(
  tx: Prisma.TransactionClient,
): SubscriptionTransaction<StoredSubscription, UserSubscriptionCycle> {
  return {
    get: (id) => read(id, tx),
    async findByGateway(gateway, gatewaySubscriptionId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`harness-subscription-provider:${gateway}:${gatewaySubscriptionId}`},0))`;
      const row = await tx.userSubscription.findFirst({
        where: {
          gateway: { equals: gateway, mode: "insensitive" },
          gatewaySubscriptionId,
        },
        orderBy: { createdAt: "desc" },
      });
      return row ? subscription(row) : null;
    },
    async findManual(draft) {
      const row = await tx.userSubscription.findFirst({
        where: {
          userId: draft.userId,
          planId: draft.planId,
          gateway: { equals: draft.gateway, mode: "insensitive" },
          gatewaySubscriptionId: "",
          deletedAt: null,
          status: { notIn: ["CANCELED", "INCOMPLETE_EXPIRED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      return row ? subscription(row) : null;
    },
    async create(draft) {
      const owner = await tx.user.findUnique({
        where: { id: draft.userId },
        select: { id: true },
      });
      if (!owner)
        throw new SubscriptionsError(
          "NOT_FOUND",
          "Subscription account not found",
        );
      return subscription(
        await tx.userSubscription.create({
          data: {
            ...draft,
            planSnapshot:
              draft.planSnapshot === null
                ? Prisma.JsonNull
                : (draft.planSnapshot as Prisma.InputJsonValue),
            status: "ACTIVE",
          },
        }),
      );
    },
    async cycleByKey(uniqueKey) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`harness-subscription-cycle:${uniqueKey}`},0))`;
      return tx.userSubscriptionCycle.findUnique({ where: { uniqueKey } });
    },
    async latestSequence(subscriptionId) {
      const latest = await tx.userSubscriptionCycle.findFirst({
        where: { subscriptionId },
        orderBy: { sequenceNumber: "desc" },
        select: { sequenceNumber: true },
      });
      return latest?.sequenceNumber ?? 0;
    },
    createCycle: (draft, sequenceNumber) =>
      tx.userSubscriptionCycle.create({
        data: { ...draft, sequenceNumber, status: "ACTIVE" },
      }),
    async update(current, patch, closeCycles) {
      const count = await tx.userSubscription.updateMany({
        where: {
          id: current.id,
          updatedAt: current.updatedAt,
          status: current.status,
        },
        data: {
          ...patch,
          updatedAt: new Date(
            Math.max(Date.now(), current.updatedAt.getTime() + 1),
          ),
        },
      });
      if (count.count !== 1) return null;
      if (closeCycles)
        await tx.userSubscriptionCycle.updateMany({
          where: {
            subscriptionId: current.id,
            status: "ACTIVE",
            deletedAt: null,
          },
          data: { status: "CLOSED" },
        });
      return (await read(current.id, tx))!;
    },
  };
}
const repository: SubscriptionRepository<
  StoredSubscription,
  UserSubscriptionCycle
> = {
  transaction: (scope, work) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`harness-subscription:${scope.kind}:${scope.id}`},0))`;
      return work(transaction(tx));
    }),
  get: read,
  async findCurrent(userId) {
    const row = await db.userSubscription.findFirst({
      where: { userId, status: "ACTIVE", deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return row ? subscription(row) : null;
  },
  currentCycle: (subscriptionId, now) =>
    db.userSubscriptionCycle.findFirst({
      where: {
        subscriptionId,
        status: "ACTIVE",
        deletedAt: null,
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      orderBy: { sequenceNumber: "desc" },
    }),
  async list(input) {
    const rows = await db.userSubscription.findMany({
      where: {
        ...(input.userId ? { userId: input.userId } : {}),
        deletedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, input.limit).map(subscription),
      nextCursor:
        rows.length > input.limit ? rows[input.limit - 1]?.id : undefined,
    };
  },
};
const stripe = createStripeSubscriptionProvider({ getClient: getStripe });
export const subscriptions = createSubscriptions({
  repository,
  isEnabled: () => isFeatureEnabled("subscriptions"),
  isManualGateway: (gateway) => gateway.toUpperCase() === "NOWPAYMENTS",
  provider(gateway) {
    if (gateway.toUpperCase() === "STRIPE") return stripe;
    throw new SubscriptionsError(
      "UNAVAILABLE",
      "No subscription lifecycle adapter is selected for this provider",
    );
  },
  async onCycleCreated(cycle, sub) {
    await appEvents.emit("subscription:cycle-created", {
      cycleId: cycle.id,
      subscriptionId: sub.id,
      userId: sub.userId,
    });
  },
});
export async function subscriptionOperation<T>(
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SubscriptionsError)
      throw new TRPCError({
        code: error.code === "UNAVAILABLE" ? "PRECONDITION_FAILED" : error.code,
        message: error.message,
      });
    throw error;
  }
}
