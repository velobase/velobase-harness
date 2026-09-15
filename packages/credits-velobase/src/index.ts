import Velobase, { isVelobaseError } from "@velobaseai/billing";
import { CreditLedgerError, type CreditLedger } from "@velobase/credits";
import type {
  GrantParams,
  GrantOutput,
  FreezeParams,
  FreezeOutput,
  ConsumeParams,
  ConsumeOutput,
  UnfreezeParams,
  UnfreezeOutput,
  GetBalanceParams,
  GetBalanceOutput,
  AccountSummary,
  GetRecordsParams,
  GetRecordsOutput,
  RecordSummary,
  PostConsumeParams,
  PostConsumeOutput,
} from "@velobase/credits/types";
import { normalizeBillingDetail } from "./details";

export function createVelobaseClient(
  apiKey: string,
  options: { maxRetries?: number } = {},
) {
  return new Velobase({ apiKey, ...options });
}
/** Only this adapter depends on the provider SDK. Constructing the ledger makes no request. */
export function createVelobaseLedger(apiKey: string): CreditLedger {
  let client: Velobase | undefined;
  function getVelobase() {
    return (client ??= createVelobaseClient(apiKey, { maxRetries: 0 }));
  }
  async function grant(params: GrantParams): Promise<GrantOutput> {
    const vb = getVelobase();

    const result = await vb.customers.deposit({
      customerId: params.userId,
      amount: params.amount,
      wallet: params.wallet,
      source: params.source ?? "default",
      idempotencyKey: params.outerBizId,
      startsAt: params.startsAt?.toISOString(),
      expiresAt: params.expiresAt?.toISOString(),
      description: params.description ?? undefined,
    });

    return {
      accountId: result.accountId,
      wallet: result.wallet,
      source: result.source,
      totalAmount: result.totalAmount,
      addedAmount: result.addedAmount,
      recordId: result.recordId,
      isIdempotentReplay: result.isIdempotentReplay,
    };
  }
  async function freeze(params: FreezeParams): Promise<FreezeOutput> {
    const vb = getVelobase();

    const result = await vb.billing.freeze({
      customerId: params.userId,
      amount: params.amount,
      transactionId: params.businessId,
      wallet: params.wallet,
      businessType: params.businessType,
      description: params.description ?? undefined,
      unfreezeAfterSeconds: params.unfreezeAfterSeconds,
      consumeAfterSeconds: params.consumeAfterSeconds,
    });

    return {
      totalAmount: result.frozenAmount,
      freezeDetails: result.freezeDetails.map((d) => ({
        freezeId: params.businessId,
        ...normalizeBillingDetail(d),
      })),
      unfreezeAfter: result.unfreezeAfter,
      consumeAfter: result.consumeAfter,
      isIdempotentReplay: result.isIdempotentReplay,
    };
  }
  async function consume(params: ConsumeParams): Promise<ConsumeOutput> {
    const vb = getVelobase();

    const result = await vb.billing.consume({
      transactionId: params.businessId,
      actualAmount: params.actualAmount,
    });

    return {
      totalAmount: result.consumedAmount,
      returnedAmount:
        (result.returnedAmount ?? 0) > 0 ? result.returnedAmount : undefined,
      overageAmount:
        (result.overageAmount ?? 0) > 0 ? result.overageAmount : undefined,
      consumeDetails: result.consumeDetails.map((d) => ({
        freezeId: params.businessId,
        ...normalizeBillingDetail(d),
      })),
      consumedAt: result.consumedAt,
      isIdempotentReplay: result.isIdempotentReplay,
    };
  }
  async function unfreeze(params: UnfreezeParams): Promise<UnfreezeOutput> {
    const vb = getVelobase();

    const result = await vb.billing.unfreeze({
      transactionId: params.businessId,
    });

    return {
      totalAmount: result.unfrozenAmount,
      unfreezeDetails: result.unfreezeDetails.map((d) => ({
        freezeId: params.businessId,
        ...normalizeBillingDetail(d),
      })),
      unfrozenAt: result.unfrozenAt,
      isIdempotentReplay: result.isIdempotentReplay,
    };
  }
  async function getBalance(
    params: GetBalanceParams,
  ): Promise<GetBalanceOutput> {
    const vb = getVelobase();

    try {
      const customer = await vb.customers.get(params.userId);

      const walletEntries = Object.entries(customer.wallets).filter(
        ([wallet]) => !params.wallet || wallet === params.wallet,
      );

      const summaries: AccountSummary[] = walletEntries.flatMap(
        ([wallet, balance]) =>
          balance.sources
            .filter((source) => source.available > 0)
            .map((source) => ({
              wallet,
              source: source.source,
              total: source.total,
              used: source.used,
              frozen: source.frozen,
              available: source.available,
              startsAt: source.startsAt ? new Date(source.startsAt) : null,
              expiresAt: source.expiresAt ? new Date(source.expiresAt) : null,
            })),
      );

      const totals = walletEntries.reduce(
        (acc, [, balance]) => ({
          total: acc.total + balance.total,
          used: acc.used + balance.used,
          frozen: acc.frozen + balance.frozen,
          available: acc.available + balance.available,
        }),
        { total: 0, used: 0, frozen: 0, available: 0 },
      );

      return {
        totalSummary: totals,
        accounts: summaries,
      };
    } catch (err) {
      if (isVelobaseError(err) && err.isType("not_found")) {
        return {
          totalSummary: { total: 0, used: 0, frozen: 0, available: 0 },
          accounts: [],
        };
      }
      throw err;
    }
  }
  async function getRecords(
    params: GetRecordsParams,
  ): Promise<GetRecordsOutput> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const vb = getVelobase();

    try {
      const res = await vb.customers.ledger(params.userId, {
        limit,
        cursor: params.cursor ?? undefined,
        operationType: params.operationType ?? undefined,
        transactionId: params.transactionId ?? undefined,
      });

      const summaries: RecordSummary[] = res.items.map((entry) => ({
        id: entry.id,
        operationType: entry.operationType as RecordSummary["operationType"],
        amount: entry.amount,
        wallet: entry.wallet,
        source: entry.source,
        transactionId: entry.transactionId ?? null,
        businessType:
          (entry.businessType as RecordSummary["businessType"]) ?? null,
        description: entry.description ?? null,
        accountId: entry.accountId,
        status: entry.status as RecordSummary["status"],
        createdAt: new Date(entry.createdAt),
      }));

      return {
        records: summaries,
        total: res.totalCount,
        hasMore: res.hasMore,
        nextCursor: res.nextCursor ?? undefined,
      };
    } catch (err) {
      if (isVelobaseError(err) && err.isType("not_found")) {
        return { records: [], total: 0, hasMore: false };
      }
      throw err;
    }
  }
  async function postConsume(
    params: PostConsumeParams,
  ): Promise<PostConsumeOutput> {
    const vb = getVelobase();

    const result = await vb.billing.deduct({
      customerId: params.userId,
      amount: params.amount,
      transactionId: params.businessId,
      wallet: params.wallet,
      businessType: params.businessType,
      description: params.description ?? undefined,
    });

    return {
      totalAmount: result.deductedAmount,
      consumeDetails: result.deductDetails.map(normalizeBillingDetail),
      consumedAt: result.deductedAt,
    };
  }
  async function write<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        isVelobaseError(error) &&
        [
          "missing_api_key",
          "invalid_api_key",
          "api_key_revoked",
          "customer_id_required",
          "transaction_id_required",
          "amount_must_be_positive",
          "invalid_starts_at",
          "invalid_expires_at",
          "invalid_datetime_range",
          "insufficient_balance",
          "customer_not_found",
        ].includes(error.code)
      )
        throw new CreditLedgerError(
          "REJECTED",
          "The ledger rejected this attempt before applying it",
        );
      throw error;
    }
  }
  return {
    getBalance,
    getRecords,
    grant: (input) => write(() => grant(input)),
    freeze: (input) => write(() => freeze(input)),
    consume: (input) => write(() => consume(input)),
    unfreeze: (input) => write(() => unfreeze(input)),
    postConsume: (input) => write(() => postConsume(input)),
  };
}
