import { campaignEligibility } from "@velobase/activities";
import { db } from "@/server/db";
import type { ValidateCodeParams, ValidateCodeResult } from "../types";

export async function validateCode(
  params: ValidateCodeParams,
): Promise<ValidateCodeResult> {
  const code = params.code.trim().toUpperCase();
  const userId = params.userId.trim();

  if (!code || !userId) {
    return {
      valid: false,
      status: "UNDEFINED",
      grantType: "UNDEFINED",
      userUsedCount: 0,
      errorMessage: "invalid params",
    };
  }

  const promo = await db.promoCode.findFirst({
    where: { code, deletedAt: null },
  });
  if (!promo) {
    return {
      valid: false,
      status: "UNDEFINED",
      grantType: "UNDEFINED",
      userUsedCount: 0,
      errorMessage: "code not found",
    };
  }

  const userUsedCount = await db.promoCodeRedemption.count({
    where: { promoCodeId: promo.id, userId },
  });
  const errorMessage = campaignEligibility(promo, userUsedCount);
  if (errorMessage)
    return {
      valid: false,
      status: errorMessage === "code expired" ? "EXPIRED" : promo.status,
      grantType: promo.grantType,
      userUsedCount,
      errorMessage,
    };

  return {
    valid: true,
    status: promo.status,
    grantType: promo.grantType,
    creditsAmount: promo.creditsAmount ?? undefined,
    productId: promo.productId ?? undefined,
    userUsedCount,
  };
}
