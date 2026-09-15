import { createCampaigns, CampaignError } from "@velobase/activities";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { requireFeature } from "@/server/features/state";

const campaigns = createCampaigns({
  repository: {
    find: (id) => db.promoCode.findFirst({ where: { id, deletedAt: null } }),
    findCode: (code) => db.promoCode.findFirst({ where: { code } }),
    create: (data) => db.promoCode.create({ data }),
    update: (id, data) => db.promoCode.update({ where: { id }, data }),
  },
  requireEnabled: () => requireFeature("promo-codes"),
  async requireReward(campaign) {
    if (campaign.grantType === "CREDIT") await requireFeature("credits");
    if (campaign.grantType === "PRODUCT") {
      await requireFeature("products");
      if (
        !campaign.productId ||
        !(await db.product.findUnique({ where: { id: campaign.productId } }))
      )
        throw new CampaignError("BAD_REQUEST", "Product reward is unavailable");
    }
  },
});
async function operation<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof CampaignError)
      throw new TRPCError({ code: error.code, message: error.message });
    throw error;
  }
}
export const createPromoDraft = (input: unknown) =>
  operation(() => campaigns.createDraft(input));
export const updatePromoActivity = (input: unknown) =>
  operation(() => campaigns.update(input));
