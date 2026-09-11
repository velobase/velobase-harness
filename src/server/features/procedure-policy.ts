import type { FeatureId } from "@velobase/module-runtime";

/** New business operations. Settlement, refunds, cancellation and history stay available. */
export function featureForProcedure(path: string): FeatureId | undefined {
  if (path === "conversation.unshare") return undefined;
  if (/^conversation\.(share|fork)$/.test(path)) return "sharing";
  if (/^(conversation|agent|userAgent)\./.test(path)) return "ai-chat";
  if (/^(project|repository|github)\./.test(path)) return "projects";
  if (path === "affiliate.activate") return "affiliate";
  if (
    /^membership\.(createSubscription|createSubscriptionCycle|earlyConvertTrial)$/.test(
      path,
    )
  )
    return "subscriptions";
  if (/^promo\./.test(path)) return "promo-codes";
  if (path === "product.hitPaywall") return "newcomer-offers";
  if (path === "product.list") return undefined;
  if (/^product\./.test(path)) return "products";
  if (
    /^order\.(checkout|create|createOrder|quickPurchase|createSetupIntent|createCryptoInvoice|getCryptoCheckoutPreview|getCryptoCurrencies|getEstimate)$/.test(
      path,
    )
  )
    return "payments";
  if (/^admin\.(grantCredits|deductCredits)$/.test(path)) return "credits";
  if (path === "admin.resetNewUserOffer") return "newcomer-offers";
  if (/^admin\.(create|update)Touch/.test(path)) return "touch";
  return undefined;
}

/** History remains readable while disabled, but a deployment that omits a capability has no API for it. */
export function includedFeatureForProcedure(
  path: string,
): FeatureId | undefined {
  if (/^features\.(mailbox|saveMailbox|verifyMailbox)$/.test(path))
    return "email-management";
  if (/^conversation\.(share|unshare|fork)$/.test(path)) return "sharing";
  const namespace = path.split(".")[0];
  const namespaces: Partial<Record<string, FeatureId>> = {
    conversation: "ai-chat",
    agent: "ai-chat",
    userAgent: "ai-chat",
    product: "products",
    order: "payments",
    membership: "subscriptions",
    billing: "credits",
    promo: "promo-codes",
    affiliate: "affiliate",
    emailManagement: "email-management",
    outreach: "touch",
    sharingAdmin: "sharing",
    project: "projects",
    repository: "projects",
    github: "projects",
  };
  if (namespace && namespaces[namespace]) return namespaces[namespace];
  if (path.startsWith("admin.")) {
    if (/Promo/.test(path)) return "promo-codes";
    if (/Touch/.test(path)) return "touch";
    if (/Affiliate/.test(path)) return "affiliate";
    if (/Product/.test(path)) return "products";
    if (/Order/.test(path)) return "payments";
    if (/Credits|BillingRecords/.test(path)) return "credits";
    if (/NewUserOffer/.test(path)) return "newcomer-offers";
  }
  return undefined;
}
