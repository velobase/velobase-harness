import { z } from "zod";

export const affiliateFeature = {
  id: "affiliate",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/admin/affiliate",
} as const;

const id = z.string().min(1).max(256);
const cents = z.number().int().min(0).max(2_147_483_647);
export const earningSourceSchema = z.object({
  sourceType: z.enum(["ORDER_PAYMENT", "SUBSCRIPTION_RENEWAL"]),
  sourceExternalId: id,
  sourceSequence: z.number().int().nonnegative().default(0),
});
export const accrualSchema = earningSourceSchema.extend({
  affiliateUserId: id,
  referredUserId: id,
  grossAmountCents: cents,
  commissionRateBps: z.number().int().min(0).max(10_000),
  availableAt: z.date(),
  context: z.record(z.string().nullable()).default({}),
});
export const payoutSchema = z.object({
  id,
  userId: id,
  amountCents: cents.refine((value) => value > 0),
  type: z.enum(["CASHOUT_USDT", "EXCHANGE_CREDITS"]),
  walletAddress: z.string().trim().max(256).nullable().default(null),
});
export const payoutActionSchema = z.object({
  requestId: id,
  action: z.enum(["APPROVE", "REJECT", "COMPLETE", "FAIL"]),
  txHash: z.string().trim().max(256).nullish(),
  adminNote: z.string().trim().max(4000).nullish(),
});
export type EarningSource = z.output<typeof earningSourceSchema>;
export type Accrual = z.output<typeof accrualSchema>;
export type EarningState = "PENDING" | "AVAILABLE" | "VOIDED";
export interface Balances {
  pendingCents: number;
  availableCents: number;
  lockedCents: number;
  debtCents: number;
}
export interface Account extends Balances {
  id: string;
  userId: string;
  version: number;
}
export interface Earning extends Accrual {
  id: string;
  state: EarningState;
  commissionCents: number;
}
export type PayoutStatus =
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "FAILED";
export interface Payout extends z.output<typeof payoutSchema> {
  status: PayoutStatus;
}
export interface LedgerEntry {
  kind:
    | "EARNING_CREATED"
    | "EARNING_MATURED"
    | "EARNING_VOIDED"
    | "EARNING_RESTORED"
    | "PAYOUT_REQUESTED"
    | "PAYOUT_RELEASED"
    | "PAYOUT_COMPLETED"
    | "EXCHANGE_CREDITS";
  referenceType: "EARNING" | "PAYOUT_REQUEST";
  referenceId: string;
  idempotencyKey: string;
  deltaPendingCents?: number;
  deltaAvailableCents?: number;
  deltaLockedCents?: number;
  deltaDebtCents?: number;
  meta?: Record<string, string | number | boolean | null>;
}
/** Every operation is owner-scoped and runs inside one locked database transaction.
 * A repository must atomically persist ledger entries and the resulting balances.
 * No remote side effect belongs inside this transaction.
 */
export interface AffiliateTransaction {
  account(): Promise<Account>;
  findEarning(source: EarningSource): Promise<Earning | null>;
  getEarning(earningId: string): Promise<Earning | null>;
  dueEarnings(now: Date, limit: number): Promise<Earning[]>;
  createEarning(
    input: Accrual & { commissionCents: number; state: EarningState },
  ): Promise<Earning>;
  setEarningState(earningId: string, state: EarningState): Promise<void>;
  getPayout(requestId: string): Promise<Payout | null>;
  activePayout(type: Payout["type"]): Promise<Payout | null>;
  createPayout(input: z.output<typeof payoutSchema>): Promise<Payout>;
  setPayout(
    requestId: string,
    change: { status: PayoutStatus; txHash?: string; adminNote?: string },
  ): Promise<void>;
  applyLedger(entry: LedgerEntry, next: Balances): Promise<void>;
}
export interface AffiliateRepository {
  withAccount<T>(
    userId: string,
    work: (tx: AffiliateTransaction) => Promise<T>,
  ): Promise<T>;
  earningOwner(earningId: string): Promise<string | null>;
  sourceOwner(source: EarningSource): Promise<string | null>;
  payoutOwner(requestId: string): Promise<string | null>;
}
export class AffiliateError extends Error {
  constructor(
    public readonly code:
      | "UNAVAILABLE"
      | "NOT_FOUND"
      | "CONFLICT"
      | "BAD_REQUEST",
    message: string,
  ) {
    super(message);
  }
}
const fail = (message: string): never => {
  throw new AffiliateError("CONFLICT", message);
};
function availableCredit(amount: number, account: Balances) {
  const repayment = Math.min(amount, account.debtCents);
  return {
    deltaAvailableCents: amount - repayment,
    deltaDebtCents: -repayment,
  };
}
async function apply(tx: AffiliateTransaction, entry: LedgerEntry) {
  const account = await tx.account();
  const next = {
    pendingCents: account.pendingCents + (entry.deltaPendingCents ?? 0),
    availableCents: account.availableCents + (entry.deltaAvailableCents ?? 0),
    lockedCents: account.lockedCents + (entry.deltaLockedCents ?? 0),
    debtCents: account.debtCents + (entry.deltaDebtCents ?? 0),
  };
  if (
    Object.values(next).some(
      (value) =>
        !Number.isSafeInteger(value) || value < 0 || value > 2_147_483_647,
    )
  )
    fail("Affiliate balance is outside its supported range");
  await tx.applyLedger(entry, next);
}

export function createAffiliate(options: {
  repository: AffiliateRepository;
  isEnabled(): Promise<boolean>;
  now?: () => Date;
}) {
  const repository = options.repository;
  const now = options.now ?? (() => new Date());
  async function matureOne(tx: AffiliateTransaction, earning: Earning) {
    if (earning.state !== "PENDING") return false;
    const account = await tx.account();
    await apply(tx, {
      kind: "EARNING_MATURED",
      referenceType: "EARNING",
      referenceId: earning.id,
      idempotencyKey: `earning_matured:${earning.id}:${account.version}`,
      deltaPendingCents: -earning.commissionCents,
      ...availableCredit(earning.commissionCents, account),
    });
    await tx.setEarningState(earning.id, "AVAILABLE");
    return true;
  }
  async function mature(tx: AffiliateTransaction) {
    let count = 0;
    for (const earning of await tx.dueEarnings(now(), 500))
      if (await matureOne(tx, earning)) count++;
    return count;
  }
  async function forEarning<T>(
    earningId: string,
    work: (tx: AffiliateTransaction, earning: Earning) => Promise<T>,
  ) {
    id.parse(earningId);
    const owner = await repository.earningOwner(earningId);
    if (!owner) throw new AffiliateError("NOT_FOUND", "Earning not found");
    return repository.withAccount(owner, async (tx) => {
      // Owner lookup is not a state snapshot. Read state after taking the owner lock.
      const earning = await tx.getEarning(earningId);
      if (!earning) throw new AffiliateError("NOT_FOUND", "Earning not found");
      return work(tx, earning);
    });
  }
  async function voidEarning(
    tx: AffiliateTransaction,
    earning: Earning,
    reason: string,
  ) {
    if (earning.state === "VOIDED") return;
    const account = await tx.account();
    const pending =
      earning.state === "PENDING"
        ? Math.min(account.pendingCents, earning.commissionCents)
        : 0;
    const available = Math.min(
      account.availableCents,
      earning.commissionCents - pending,
    );
    // A payout owns its reservation until it settles or is released. A refund cannot spend it.
    await apply(tx, {
      kind: "EARNING_VOIDED",
      referenceType: "EARNING",
      referenceId: earning.id,
      idempotencyKey: `earning_voided:${earning.id}:${account.version}`,
      deltaPendingCents: -pending,
      deltaAvailableCents: -available,
      deltaDebtCents: earning.commissionCents - pending - available,
      meta: { reason, previousState: earning.state },
    });
    await tx.setEarningState(earning.id, "VOIDED");
  }
  async function reservePayout(input: unknown) {
    const data = payoutSchema.parse(input);
    return repository.withAccount(data.userId, async (tx) => {
      const previous = await tx.getPayout(data.id);
      if (previous) {
        if (
          previous.amountCents !== data.amountCents ||
          previous.type !== data.type ||
          previous.walletAddress !== data.walletAddress
        )
          fail("Request identity was already used for a different payout");
        return previous;
      }
      await mature(tx);
      if (await tx.activePayout(data.type))
        fail("A payout of this type is already pending");
      const account = await tx.account();
      if (account.debtCents > 0 || account.availableCents < data.amountCents)
        throw new AffiliateError(
          "BAD_REQUEST",
          "Insufficient available balance",
        );
      const request = await tx.createPayout(data);
      await apply(tx, {
        kind: "PAYOUT_REQUESTED",
        referenceType: "PAYOUT_REQUEST",
        referenceId: request.id,
        idempotencyKey: `payout_requested:${request.id}`,
        deltaAvailableCents: -request.amountCents,
        deltaLockedCents: request.amountCents,
      });
      return request;
    });
  }
  async function updatePayout(input: unknown, allowExchange: boolean) {
    const data = payoutActionSchema.parse(input);
    const owner = await repository.payoutOwner(data.requestId);
    if (!owner)
      throw new AffiliateError("NOT_FOUND", "Payout request not found");
    return repository.withAccount(owner, async (tx) => {
      const request = await tx.getPayout(data.requestId);
      if (!request)
        throw new AffiliateError("NOT_FOUND", "Payout request not found");
      if (request.type === "EXCHANGE_CREDITS" && !allowExchange)
        fail(
          "Credit exchanges must settle through the installed credits extension",
        );
      const target: PayoutStatus = {
        APPROVE: "APPROVED",
        REJECT: "REJECTED",
        COMPLETE: "COMPLETED",
        FAIL: "FAILED",
      }[data.action] as PayoutStatus;
      if (request.status === target) return;
      if (!["REQUESTED", "APPROVED"].includes(request.status))
        fail("Payout is already settled");
      if (data.action === "APPROVE") {
        await tx.setPayout(request.id, {
          status: "APPROVED",
          adminNote: data.adminNote ?? undefined,
        });
        return;
      }
      if (
        data.action === "COMPLETE" &&
        request.type === "CASHOUT_USDT" &&
        !data.txHash
      )
        throw new AffiliateError(
          "BAD_REQUEST",
          "Settlement transaction hash is required",
        );
      const release = data.action === "REJECT" || data.action === "FAIL";
      const account = await tx.account();
      await apply(tx, {
        kind: release
          ? "PAYOUT_RELEASED"
          : request.type === "EXCHANGE_CREDITS"
            ? "EXCHANGE_CREDITS"
            : "PAYOUT_COMPLETED",
        referenceType: "PAYOUT_REQUEST",
        referenceId: request.id,
        idempotencyKey: `${release ? "payout_released" : "payout_completed"}:${request.id}`,
        deltaLockedCents: -request.amountCents,
        ...(release ? availableCredit(request.amountCents, account) : {}),
        meta: { txHash: data.txHash ?? null },
      });
      await tx.setPayout(request.id, {
        status: target,
        txHash: data.txHash ?? undefined,
        adminNote: data.adminNote ?? undefined,
      });
    });
  }
  return {
    async accrue(input: unknown) {
      const data = accrualSchema.parse(input);
      if (data.affiliateUserId === data.referredUserId) return null;
      const commissionCents = Math.floor(
        (data.grossAmountCents * data.commissionRateBps) / 10_000,
      );
      if (!commissionCents) return null;
      if (!(await options.isEnabled()))
        throw new AffiliateError(
          "UNAVAILABLE",
          "Affiliate enrollment and new commissions are disabled",
        );
      return repository.withAccount(data.affiliateUserId, async (tx) => {
        const previous = await tx.findEarning(data);
        if (previous) return previous; // Never reset the hold date or revive a reversed earning on replay.
        const state = data.availableAt <= now() ? "AVAILABLE" : "PENDING";
        const earning = await tx.createEarning({
          ...data,
          commissionCents,
          state,
        });
        const account = await tx.account();
        await apply(tx, {
          kind: "EARNING_CREATED",
          referenceType: "EARNING",
          referenceId: earning.id,
          idempotencyKey: `earning_created:${earning.id}`,
          ...(state === "PENDING"
            ? { deltaPendingCents: commissionCents }
            : availableCredit(commissionCents, account)),
        });
        return earning;
      });
    },
    async mature(userId: string) {
      return repository.withAccount(id.parse(userId), mature);
    },
    async balances(userId: string): Promise<Balances> {
      return repository.withAccount(id.parse(userId), async (tx) => {
        await mature(tx);
        const { pendingCents, availableCents, lockedCents, debtCents } =
          await tx.account();
        return { pendingCents, availableCents, lockedCents, debtCents };
      });
    },
    reservePayout,
    updatePayout: (input: unknown) => updatePayout(input, false),
    /** Called only by an installed extension, after its idempotent external grant succeeds. */
    completeExchange: (requestId: string) =>
      updatePayout({ requestId, action: "COMPLETE" }, true),
    async reverse(input: unknown, reason: string) {
      const source = earningSourceSchema.parse(input);
      id.parse(reason);
      const owner = await repository.sourceOwner(source);
      if (!owner) return;
      await repository.withAccount(owner, async (tx) => {
        const earning = await tx.findEarning(source);
        if (earning) await voidEarning(tx, earning, reason);
      });
    },
    forceMature: (earningId: string) => forEarning(earningId, matureOne),
    voidAsAdmin: (earningId: string) =>
      forEarning(earningId, (tx, earning) => voidEarning(tx, earning, "admin")),
    async restoreAsAdmin(
      earningId: string,
      inputState: "PENDING" | "AVAILABLE",
    ) {
      const state = z.enum(["PENDING", "AVAILABLE"]).parse(inputState);
      return forEarning(earningId, async (tx, earning) => {
        if (earning.state === state) return;
        if (earning.state !== "VOIDED")
          fail("Only a voided earning can be restored");
        const account = await tx.account();
        await apply(tx, {
          kind: "EARNING_RESTORED",
          referenceType: "EARNING",
          referenceId: earning.id,
          idempotencyKey: `earning_restored:${earning.id}:${account.version}`,
          ...(state === "PENDING"
            ? { deltaPendingCents: earning.commissionCents }
            : availableCredit(earning.commissionCents, account)),
        });
        await tx.setEarningState(earning.id, state);
      });
    },
  };
}
