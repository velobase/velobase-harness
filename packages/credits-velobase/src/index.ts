import {
  BillingError,
  createBilling,
  type ReservationResult,
} from "@velobase/billing";
import {
  CreditLedgerError,
  type CreditLedger,
  type BillingBusinessType,
  type BillingOperationType,
  type ConsumeOutput,
} from "@velobase/credits";
import type { Pool } from "pg";
import { z } from "zod";

export type VelobaseLedgerOptions = {
  pool: Pool;
  tenantId: string;
  projectId: string;
  onError(error: unknown, context: Record<string, unknown>): void;
};

type ReservationRow = {
  id: string;
  reserved_amount: string;
  updated_at: Date;
  automatic_action: "SETTLE" | "RELEASE";
  transaction_id: string;
};
type EntryRow = {
  id: string;
  operation: "GRANT" | "RESERVE" | "SETTLE" | "RELEASE";
  amount: string;
  wallet: string;
  source: string;
  transaction_id: string;
  description: string | null;
  grant_id: string;
  metadata: { businessType?: BillingBusinessType } | null;
  created_at: Date;
};
const operations: Record<EntryRow["operation"], BillingOperationType> = {
  GRANT: "GRANT",
  RESERVE: "FREEZE",
  SETTLE: "CONSUME",
  RELEASE: "UNFREEZE",
};
const cursorSchema = z.tuple([z.string().datetime(), z.string().uuid()]);
function amount(value: string | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new BillingError(
      "INVARIANT_VIOLATION",
      "Ledger amount exceeds the safe integer range",
      { value },
    );
  return result;
}

/** In-process PostgreSQL engine. All mutations go through @velobase/billing. */
export function createVelobaseLedger(
  options: VelobaseLedgerOptions,
): CreditLedger & {
  settleDue(): Promise<void>;
} {
  const { pool } = options;
  const engine = createBilling(options);
  const { tenantId, projectId } = engine;
  const scope = [tenantId, projectId];

  async function attempt<T>(
    operation: string,
    input: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      options.onError(error, { operation, input, tenantId, projectId });
      // Only these engine failures prove this attempt did not mutate the ledger.
      if (
        error instanceof BillingError &&
        [
          "INVALID_ARGUMENT",
          "INSUFFICIENT_BALANCE",
          "TRANSACTION_NOT_FOUND",
        ].includes(error.code)
      )
        throw new CreditLedgerError("REJECTED", error.message, {
          cause: error,
        });
      throw error;
    }
  }
  async function reservation(transactionId: string): Promise<ReservationRow> {
    const result = await pool.query<ReservationRow>(
      `SELECT id, reserved_amount, updated_at, automatic_action, transaction_id
       FROM billing_reservations WHERE tenant_id = $1 AND project_id = $2 AND transaction_id = $3`,
      [...scope, transactionId],
    );
    if (!result.rows[0])
      throw new BillingError(
        "TRANSACTION_NOT_FOUND",
        "Reservation does not exist",
        { transactionId },
      );
    return result.rows[0];
  }
  async function details(
    result: ReservationResult,
    column: "settled_amount" | "released_amount",
  ) {
    const rows = await pool.query<{
      grant_id: string;
      source: string;
      amount: string;
    }>(
      `SELECT a.grant_id, g.source, a.${column} AS amount
       FROM billing_allocations a JOIN billing_grants g ON g.id = a.grant_id
       WHERE a.reservation_id = $1 AND g.tenant_id = $2 AND g.project_id = $3
       AND a.${column} > 0 ORDER BY a.allocation_order`,
      [result.reservationId, ...scope],
    );
    return rows.rows.map((row) => ({
      freezeId: result.transactionId,
      accountId: row.grant_id,
      wallet: result.wallet,
      source: row.source,
      amount: amount(row.amount),
    }));
  }
  async function consumed(result: ReservationResult): Promise<ConsumeOutput> {
    const row = await reservation(result.transactionId);
    return {
      totalAmount: result.settledAmount,
      returnedAmount: result.releasedAmount,
      consumeDetails: await details(result, "settled_amount"),
      consumedAt: row.updated_at.toISOString(),
      isIdempotentReplay: result.replayed,
    };
  }

  return {
    async grant(input) {
      const result = await attempt("grant", input, () =>
        engine.grant({
          customerId: input.userId,
          amount: input.amount,
          wallet: input.wallet,
          source: input.source,
          idempotencyKey: input.outerBizId,
          validFrom: input.startsAt ?? undefined,
          expiresAt: input.expiresAt ?? undefined,
          description: input.description,
          metadata: {
            businessType: input.businessType ?? null,
            referenceId: input.referenceId ?? null,
          },
        }),
      );
      const receipt = await pool.query<{ id: string }>(
        `SELECT id FROM billing_ledger_entries WHERE tenant_id = $1 AND project_id = $2
         AND grant_id = $3 AND operation = 'GRANT'`,
        [...scope, result.grantId],
      );
      if (!receipt.rows[0])
        throw new BillingError(
          "INVARIANT_VIOLATION",
          "Grant receipt is missing",
          { grantId: result.grantId },
        );
      return {
        accountId: result.grantId,
        wallet: result.wallet,
        source: result.source,
        totalAmount: result.amount,
        addedAmount: result.amount,
        recordId: receipt.rows[0].id,
        isIdempotentReplay: result.replayed,
      };
    },
    async freeze(input) {
      const result = await attempt("reserve", input, () =>
        engine.reserve({
          customerId: input.userId,
          amount: input.amount,
          transactionId: input.businessId,
          wallet: input.wallet,
          description: input.description,
          autoReleaseAfterSeconds: input.unfreezeAfterSeconds,
          autoSettleAfterSeconds: input.consumeAfterSeconds,
          metadata: { businessType: input.businessType },
        }),
      );
      return {
        totalAmount: result.reservedAmount,
        freezeDetails: result.allocations.map((entry) => ({
          freezeId: input.businessId,
          accountId: entry.grantId,
          wallet: result.wallet,
          source: entry.source,
          amount: entry.amount,
        })),
        unfreezeAfter:
          result.automaticAction === "RELEASE"
            ? result.automaticActionAt?.toISOString()
            : null,
        consumeAfter:
          result.automaticAction === "SETTLE"
            ? result.automaticActionAt?.toISOString()
            : null,
        isIdempotentReplay: result.replayed,
      };
    },
    async consume(input) {
      const actualAmount =
        input.actualAmount ??
        amount((await reservation(input.businessId)).reserved_amount);
      return consumed(
        await attempt("settle", input, () =>
          engine.settle({ transactionId: input.businessId, actualAmount }),
        ),
      );
    },
    async unfreeze(input) {
      const result = await attempt("release", input, () =>
        engine.release({ transactionId: input.businessId }),
      );
      return {
        totalAmount: result.releasedAmount,
        unfreezeDetails: await details(result, "released_amount"),
        unfrozenAt: (
          await reservation(input.businessId)
        ).updated_at.toISOString(),
        isIdempotentReplay: result.replayed,
      };
    },
    async postConsume(input) {
      // Persist an auto-settling reservation first, so a crash between the two calls is recoverable.
      await attempt("deduct.reserve", input, () =>
        engine.reserve({
          customerId: input.userId,
          amount: input.amount,
          transactionId: input.businessId,
          wallet: input.wallet,
          description: input.description,
          autoSettleAfterSeconds: 60,
          metadata: {
            businessType: input.businessType ?? null,
            referenceId: input.referenceId ?? null,
            directDeduction: true,
          },
        }),
      );
      // A reservation already exists: never classify a later failure as a rejected write.
      try {
        const result = await consumed(
          await engine.settle({
            transactionId: input.businessId,
            actualAmount: input.amount,
          }),
        );
        return {
          totalAmount: result.totalAmount,
          consumeDetails: result.consumeDetails,
          consumedAt: result.consumedAt,
        };
      } catch (error) {
        options.onError(error, {
          operation: "deduct.settle",
          input,
          tenantId,
          projectId,
        });
        throw error;
      }
    },
    async getBalance(input) {
      // The engine's public balance read selects one wallet; the host also needs an all-wallet view.
      const rows = await pool.query<{
        wallet: string;
        source: string;
        total_amount: string;
        used_amount: string;
        reserved_amount: string;
        valid_from: Date | null;
        expires_at: Date | null;
      }>(
        `SELECT wallet, source, total_amount, used_amount, reserved_amount, valid_from, expires_at
         FROM billing_grants WHERE tenant_id = $1 AND project_id = $2 AND customer_id = $3
         AND ($4::text IS NULL OR wallet = $4)
         AND (valid_from IS NULL OR valid_from <= NOW()) AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC`,
        [...scope, input.userId, input.wallet ?? null],
      );
      const accounts = rows.rows.map((row) => ({
        wallet: row.wallet,
        source: row.source,
        total: amount(row.total_amount),
        used: amount(row.used_amount),
        frozen: amount(row.reserved_amount),
        available:
          amount(row.total_amount) -
          amount(row.used_amount) -
          amount(row.reserved_amount),
        startsAt: row.valid_from,
        expiresAt: row.expires_at,
      }));
      const totalSummary = accounts.reduce(
        (sum, account) => ({
          total: amount(sum.total + account.total),
          used: amount(sum.used + account.used),
          frozen: amount(sum.frozen + account.frozen),
          available: amount(sum.available + account.available),
        }),
        { total: 0, used: 0, frozen: 0, available: 0 },
      );
      return { totalSummary, accounts };
    },
    async getRecords(input) {
      const limit = z
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(input.limit ?? 20);
      let cursor: z.infer<typeof cursorSchema> | undefined;
      if (input.cursor) {
        try {
          cursor = cursorSchema.parse(
            JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
          );
        } catch (cause) {
          throw new BillingError("INVALID_ARGUMENT", "Invalid ledger cursor", {
            cause,
          });
        }
      }
      const operation = input.operationType
        ? (Object.entries(operations).find(
            ([, value]) => value === input.operationType,
          )?.[0] ?? "UNKNOWN")
        : null;
      const values = [
        ...scope,
        input.userId,
        operation,
        input.transactionId ?? null,
      ];
      const where = `tenant_id = $1 AND project_id = $2 AND customer_id = $3
        AND ($4::text IS NULL OR operation = $4) AND ($5::text IS NULL OR transaction_id = $5)`;
      const [rows, count] = await Promise.all([
        pool.query<EntryRow>(
          `SELECT * FROM billing_ledger_entries WHERE ${where}
          AND ($6::timestamptz IS NULL OR (created_at, id) < ($6::timestamptz, $7::uuid))
          ORDER BY created_at DESC, id DESC LIMIT $8`,
          [...values, cursor?.[0] ?? null, cursor?.[1] ?? null, limit + 1],
        ),
        pool.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM billing_ledger_entries WHERE ${where}`,
          values,
        ),
      ]);
      const hasMore = rows.rows.length > limit;
      const entries = rows.rows.slice(0, limit);
      const last = entries.at(-1);
      return {
        records: entries.map((entry) => ({
          id: entry.id,
          operationType: operations[entry.operation],
          amount: amount(entry.amount),
          wallet: entry.wallet,
          source: entry.source,
          transactionId: entry.transaction_id,
          businessType: entry.metadata?.businessType ?? null,
          description: entry.description,
          accountId: entry.grant_id,
          status: "COMPLETED" as const,
          createdAt: entry.created_at,
        })),
        total: amount(count.rows[0]?.total ?? "0"),
        hasMore,
        nextCursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify([last.created_at.toISOString(), last.id]),
              ).toString("base64url")
            : undefined,
      };
    },
    async settleDue() {
      const due = await pool.query<ReservationRow>(
        `SELECT id, transaction_id, reserved_amount, automatic_action, updated_at FROM billing_reservations
         WHERE tenant_id = $1 AND project_id = $2 AND status = 'RESERVED' AND automatic_action_at <= NOW()
         ORDER BY automatic_action_at, id LIMIT 100`,
        scope,
      );
      const failures: unknown[] = [];
      for (const row of due.rows) {
        try {
          if (row.automatic_action === "SETTLE")
            await engine.settle({
              transactionId: row.transaction_id,
              actualAmount: amount(row.reserved_amount),
            });
          else await engine.release({ transactionId: row.transaction_id });
        } catch (error) {
          options.onError(error, {
            operation: "settleDue",
            transactionId: row.transaction_id,
            tenantId,
            projectId,
          });
          // Another worker or request may have completed this reservation after the scan.
          if (
            error instanceof BillingError &&
            [
              "TRANSACTION_ALREADY_SETTLED",
              "TRANSACTION_ALREADY_RELEASED",
              "IDEMPOTENCY_CONFLICT",
            ].includes(error.code)
          )
            continue;
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(
          failures,
          "Automatic credit settlement failed",
        );
    },
  };
}
