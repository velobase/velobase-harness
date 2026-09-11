import { z } from "zod";
import {
  GrantInputSchema,
  FreezeInputSchema,
  ConsumeInputSchema,
  UnfreezeInputSchema,
  GetBalanceInputSchema,
  GetRecordsInputSchema,
  PostConsumeInputSchema,
} from "./schemas";
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
  GetRecordsParams,
  GetRecordsOutput,
  PostConsumeParams,
  PostConsumeOutput,
} from "./types";
export * from "./types";
export * from "./schemas";

export const creditsFeature = {
  id: "credits",
  category: "business",
  dependencies: [],
  defaultEnabled: false,
  href: "/admin/credits",
  connection: "ledger",
} as const;
export interface CreditLedger {
  getBalance(input: GetBalanceParams): Promise<GetBalanceOutput>;
  getRecords(input: GetRecordsParams): Promise<GetRecordsOutput>;
  grant(input: GrantParams): Promise<GrantOutput>;
  freeze(input: FreezeParams): Promise<FreezeOutput>;
  consume(input: ConsumeParams): Promise<ConsumeOutput>;
  unfreeze(input: UnfreezeParams): Promise<UnfreezeOutput>;
  postConsume(input: PostConsumeParams): Promise<PostConsumeOutput>;
}
export class CreditsError extends Error {
  constructor(
    public readonly code: "UNAVAILABLE",
    message: string,
  ) {
    super(message);
  }
}
/** A provider can identify an attempt rejected before mutation. Unknown outcomes must keep their identity. */
export class CreditLedgerError extends Error {
  constructor(
    public readonly outcome: "REJECTED",
    message: string,
  ) {
    super(message);
  }
}
const ownerSchema = z.object({ userId: z.string().min(1).max(256) });
const balanceSchema = GetBalanceInputSchema.merge(ownerSchema);
const recordsSchema = GetRecordsInputSchema.merge(ownerSchema);

/** Host authorization precedes these trusted service calls. A customer may read only their own account.
 * New spending/rewards obey the switch. Existing reservations and purchased entitlements can settle.
 */
export function createCredits(options: {
  ledger(): CreditLedger | Promise<CreditLedger>;
  isEnabled(): Promise<boolean>;
}) {
  async function newOperation() {
    if (!(await options.isEnabled()))
      throw new CreditsError(
        "UNAVAILABLE",
        "New credit operations are disabled",
      );
  }
  async function validatedGrant(input: unknown) {
    const data = GrantInputSchema.parse(input);
    if (data.startsAt && data.expiresAt && data.expiresAt <= data.startsAt)
      throw new z.ZodError([
        {
          code: "custom",
          path: ["expiresAt"],
          message: "Expiry must follow the start date",
        },
      ]);
    return (await options.ledger()).grant(data);
  }
  return {
    async getBalance(input: unknown) {
      return (await options.ledger()).getBalance(balanceSchema.parse(input));
    },
    async getRecords(input: unknown) {
      const data = recordsSchema.parse(input);
      return (await options.ledger()).getRecords({
        ...data,
        limit: data.limit ?? 20,
      });
    },
    async grant(input: unknown) {
      await newOperation();
      return validatedGrant(input);
    },
    /** Only a trusted fulfillment path may use this for an already accepted obligation. */
    settleGrant: validatedGrant,
    async freeze(input: unknown) {
      await newOperation();
      return (await options.ledger()).freeze(FreezeInputSchema.parse(input));
    },
    async postConsume(input: unknown) {
      await newOperation();
      return (await options.ledger()).postConsume(
        PostConsumeInputSchema.parse(input),
      );
    },
    /** Actual usage was incurred before the switch changed; stable businessId is required. */
    async settleDeduction(input: unknown) {
      return (await options.ledger()).postConsume(
        PostConsumeInputSchema.parse(input),
      );
    },
    async consume(input: unknown) {
      return (await options.ledger()).consume(ConsumeInputSchema.parse(input));
    },
    async unfreeze(input: unknown) {
      return (await options.ledger()).unfreeze(
        UnfreezeInputSchema.parse(input),
      );
    },
  };
}
