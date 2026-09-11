const DEFAULT_WALLET = "default";
const DEFAULT_SOURCE = "default";

export type BillingSdkDetail = {
  accountId?: string;
  wallet: string;
  source: string;
  amount: number;
};

export function normalizeBillingDetail(detail: unknown): BillingSdkDetail {
  if (!detail || typeof detail !== "object") {
    return { wallet: DEFAULT_WALLET, source: DEFAULT_SOURCE, amount: 0 };
  }

  const raw = detail as Record<string, unknown>;
  const amount =
    pickNumber(raw.amount) ??
    pickNumber(raw.consumed) ??
    pickNumber(raw.frozen) ??
    pickNumber(raw.unfrozen) ??
    pickNumber(raw.deducted) ??
    0;

  return {
    accountId: pickString(raw.accountId),
    wallet: pickString(raw.wallet) ?? DEFAULT_WALLET,
    source: pickString(raw.source) ?? DEFAULT_SOURCE,
    amount,
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
