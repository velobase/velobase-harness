import { z } from "zod";

export const activitiesFeature = {
  id: "promo-codes",
  category: "business",
  dependencies: ["credits"],
  defaultEnabled: false,
} as const;

const timestamp = z.string().datetime({ offset: true });
export const createCampaignInput = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.toUpperCase()),
  codeType: z
    .enum(["UNDEFINED", "KOL_INTERNAL", "USER_PROMOTION"])
    .default("USER_PROMOTION"),
  grantType: z.enum(["CREDIT", "PRODUCT"]),
  creditsAmount: z.number().int().min(0).default(0),
  productId: z.string().min(1).optional(),
  usageLimit: z.number().int().min(0).default(0),
  perUserLimit: z.number().int().min(0).default(1),
  startsAt: timestamp.optional(),
  expiresAt: timestamp.optional(),
  notes: z.string().max(10000).optional(),
});
export const updateCampaignInput = z.object({
  id: z.string().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "DISABLED", "EXPIRED"]).optional(),
  creditsAmount: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(0).optional(),
  perUserLimit: z.number().int().min(0).optional(),
  expiresAt: timestamp.nullable().optional(),
  notes: z.string().max(10000).optional(),
});
export interface Campaign {
  id: string;
  code: string;
  status: "UNDEFINED" | "DRAFT" | "ACTIVE" | "DISABLED" | "EXPIRED";
  grantType: "UNDEFINED" | "CREDIT" | "PRODUCT";
  creditsAmount: number | null;
  productId: string | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number;
  usedCount: number;
  perUserLimit: number;
}
export class CampaignError extends Error {
  constructor(
    public readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
  }
}
export type CampaignDraft = Omit<
  z.output<typeof createCampaignInput>,
  "startsAt" | "expiresAt" | "productId"
> & {
  status: "DRAFT";
  startsAt: Date | null;
  expiresAt: Date | null;
  productId: string | null;
};
export type CampaignUpdate = Omit<
  z.output<typeof updateCampaignInput>,
  "id" | "expiresAt"
> & { expiresAt: Date | null };
export interface CampaignRepository<T extends Campaign> {
  find(id: string): Promise<T | null>;
  findCode(code: string): Promise<T | null>;
  create(input: CampaignDraft): Promise<T>;
  update(id: string, input: CampaignUpdate): Promise<T>;
}
function validDates(start: Date | null, end: Date | null) {
  if (start && end && end <= start)
    throw new CampaignError("BAD_REQUEST", "Expiry must follow the start date");
}
function validReward(
  campaign: Pick<Campaign, "grantType" | "creditsAmount" | "productId">,
) {
  if (campaign.grantType === "CREDIT" && (campaign.creditsAmount ?? 0) > 0)
    return;
  if (campaign.grantType === "PRODUCT" && campaign.productId) return;
  throw new CampaignError(
    "BAD_REQUEST",
    "Configure a positive credit reward or choose a product",
  );
}
/** Drafts do not depend on enabling participation. The host owns storage and reward delivery. */
export function createCampaigns<T extends Campaign>(options: {
  repository: CampaignRepository<T>;
  requireEnabled(): Promise<void>;
  requireReward(
    campaign: Pick<Campaign, "grantType" | "creditsAmount" | "productId">,
  ): Promise<void>;
}) {
  return {
    async createDraft(input: unknown) {
      const parsed = createCampaignInput.parse(input);
      const data: CampaignDraft = {
        ...parsed,
        productId: parsed.productId ?? null,
        startsAt: parsed.startsAt ? new Date(parsed.startsAt) : null,
        expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
        status: "DRAFT",
      };
      validDates(data.startsAt, data.expiresAt);
      validReward(data);
      if (await options.repository.findCode(data.code))
        throw new CampaignError("CONFLICT", "Code already exists");
      return options.repository.create(data);
    },
    async update(input: unknown) {
      const { id, expiresAt, ...data } = updateCampaignInput.parse(input);
      const current = await options.repository.find(id);
      if (!current) throw new CampaignError("NOT_FOUND", "Activity not found");
      const end =
        expiresAt === undefined
          ? current.expiresAt
          : expiresAt
            ? new Date(expiresAt)
            : null;
      validDates(current.startsAt, end);
      const next = { ...current, ...data, expiresAt: end };
      if (next.status === "ACTIVE") {
        await options.requireEnabled();
        validReward(next);
        if (end && end <= new Date())
          throw new CampaignError(
            "BAD_REQUEST",
            "Extend the expiry before publishing",
          );
        await options.requireReward(next);
      }
      return options.repository.update(id, { ...data, expiresAt: end });
    },
  };
}
/** Use inside a locked redemption transaction as well as in public eligibility previews. */
export function campaignEligibility(
  campaign: Campaign,
  userUsedCount: number,
  now = new Date(),
) {
  if (campaign.status !== "ACTIVE") return "code not active";
  if (campaign.startsAt && campaign.startsAt > now) return "code not started";
  if (campaign.expiresAt && campaign.expiresAt <= now) return "code expired";
  if (campaign.usageLimit > 0 && campaign.usedCount >= campaign.usageLimit)
    return "code used out";
  try {
    validReward(campaign);
  } catch {
    return "code not configured";
  }
  if (campaign.perUserLimit > 0 && userUsedCount >= campaign.perUserLimit)
    return userUsedCount > 0 ? "already redeemed" : "per user limit reached";
  return null;
}
