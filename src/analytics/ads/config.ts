/**
 * 广告平台统一配置
 *
 * 所有广告 ID / 事件 ID 通过 NEXT_PUBLIC_* 环境变量注入，
 * 未配置的平台自动禁用（对应函数为 no-op）。
 */

export const ADS_CONFIG = {
  google: {
    measurementId: process.env.NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ID ?? "",
    conversionLabel: process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL ?? "",
  },
  twitter: {
    pixelId: process.env.NEXT_PUBLIC_TWITTER_PIXEL_ID ?? "",
    purchaseEventId: process.env.NEXT_PUBLIC_TWITTER_PURCHASE_EVENT_ID ?? "",
  },
  propeller: {
    aid: process.env.NEXT_PUBLIC_PROPELLER_AID ?? "",
    tid: process.env.NEXT_PUBLIC_PROPELLER_TID ?? "",
  },
  trafficJunky: {
    accountId: process.env.NEXT_PUBLIC_TJ_ACCOUNT_ID ?? "",
    memberId: process.env.NEXT_PUBLIC_TJ_MEMBER_ID ?? "",
  },
} as const;

export function getGoogleAdsConfig() {
  return ADS_CONFIG.google;
}

export function isGoogleAdsEnabled() {
  return !!ADS_CONFIG.google.measurementId;
}

export function isTwitterAdsEnabled() {
  return !!ADS_CONFIG.twitter.pixelId && !!ADS_CONFIG.twitter.purchaseEventId;
}

export function isPropellerEnabled() {
  return !!ADS_CONFIG.propeller.aid;
}

export function isTrafficJunkyEnabled() {
  return !!ADS_CONFIG.trafficJunky.accountId;
}
