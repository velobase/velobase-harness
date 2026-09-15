export type BillingSource =
  | "default"
  | "free_trial"
  | "membership"
  | "order"
  | "daily_login"
  | "first_login"
  | "promo_code"
  | (string & {});

export type BillingOperationType =
  | "UNDEFINED"
  | "FREEZE"
  | "CONSUME"
  | "UNFREEZE"
  | "GRANT"
  | "AUTO_UNFREEZE"
  | "AUTO_CONSUME";

export type BillingBusinessType =
  | "UNDEFINED"
  | "TASK"
  | "ORDER"
  | "MEMBERSHIP"
  | "SUBSCRIPTION"
  | "FREE_TRIAL"
  | "ADMIN_GRANT"
  | "TOKEN_USAGE";

export type BillingRecordStatus = "UNDEFINED" | "COMPLETED" | "FAILED";

export type BillingFreezeStatus =
  | "UNDEFINED"
  | "FROZEN"
  | "CONSUMED"
  | "UNFROZEN";

export type GrantParams = {
  userId: string;
  wallet?: string;
  source?: BillingSource;
  amount: number;
  outerBizId: string;
  businessType?: BillingBusinessType;
  referenceId?: string;
  description?: string;
  startsAt?: Date | null;
  expiresAt?: Date | null;
};

export type GrantOutput = {
  accountId: string;
  wallet: string;
  source: string;
  totalAmount: number;
  addedAmount: number;
  recordId: string;
  isIdempotentReplay: boolean;
};

export type FreezeParams = {
  userId: string;
  wallet?: string;
  businessId: string;
  businessType: BillingBusinessType;
  amount: number;
  description?: string;
  unfreezeAfterSeconds?: number;
  consumeAfterSeconds?: number;
};

export type FreezeDetail = {
  freezeId: string;
  accountId?: string;
  wallet: string;
  source: string;
  amount: number;
};

export type FreezeOutput = {
  totalAmount: number;
  freezeDetails: FreezeDetail[];
  unfreezeAfter?: string | null;
  consumeAfter?: string | null;
  isIdempotentReplay: boolean;
};

export type ConsumeParams = {
  businessId: string;
  actualAmount?: number;
};

export type ConsumeDetail = {
  freezeId: string;
  accountId?: string;
  wallet: string;
  source: string;
  amount: number;
};

export type ConsumeOutput = {
  totalAmount: number;
  returnedAmount?: number;
  overageAmount?: number;
  consumeDetails: ConsumeDetail[];
  consumedAt: string;
  isIdempotentReplay: boolean;
};

export type UnfreezeParams = {
  businessId: string;
};

export type UnfreezeDetail = {
  freezeId: string;
  accountId?: string;
  wallet: string;
  source: string;
  amount: number;
};

export type UnfreezeOutput = {
  totalAmount: number;
  unfreezeDetails: UnfreezeDetail[];
  unfrozenAt: string;
  isIdempotentReplay: boolean;
};

export type GetBalanceParams = {
  userId: string;
  wallet?: string;
};

export type AccountSummary = {
  wallet: string;
  source: string;
  total: number;
  used: number;
  frozen: number;
  available: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
};

export type GetBalanceOutput = {
  totalSummary: {
    total: number;
    used: number;
    frozen: number;
    available: number;
  };
  accounts: AccountSummary[];
};

export type GetRecordsParams = {
  userId: string;
  limit?: number;
  cursor?: string;
  operationType?: string;
  transactionId?: string;
};

export type RecordSummary = {
  id: string;
  operationType: BillingOperationType;
  amount: number;
  wallet: string;
  source: string;
  transactionId?: string | null;
  businessType?: BillingBusinessType | null;
  description?: string | null;
  accountId: string;
  status: BillingRecordStatus;
  createdAt: Date;
};

export type GetRecordsOutput = {
  records: RecordSummary[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
};

export type PostConsumeParams = {
  userId: string;
  wallet?: string;
  amount: number;
  businessId: string;
  businessType?: BillingBusinessType;
  referenceId?: string;
  description?: string;
};

export type PostConsumeDetail = {
  accountId?: string;
  wallet: string;
  source: string;
  amount: number;
};

export type PostConsumeOutput = {
  totalAmount: number;
  consumeDetails: PostConsumeDetail[];
  consumedAt: string;
};
