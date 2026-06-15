/**
 * Processors Index
 *
 * 导出所有任务处理器
 */
export {
  orderCompensationScheduler,
  processOrderCompensationJob,
  registerOrderCompensationScheduler,
} from "./order-compensation";

export {
  processSubscriptionMonthlyCreditsJob,
  registerSubscriptionMonthlyCreditsScheduler,
  subscriptionMonthlyCreditsScheduler,
} from "./subscription-monthly-credits";

export {
  processSubscriptionCompensationJob,
  registerSubscriptionCompensationScheduler,
  subscriptionCompensationScheduler,
} from "./subscription-compensation";

export {
  processStaleJobCleanup,
  registerStaleJobCleanupScheduler,
  staleJobCleanupScheduler,
} from "./stale-job-cleanup";

export {
  conversionAlertScheduler,
  processConversionAlert,
  registerConversionAlertScheduler,
} from "./conversion-alert";

export {
  paymentReconciliationScheduler,
  processPaymentReconciliation,
  registerPaymentReconciliationScheduler,
} from "./payment-reconciliation";

export {
  processTouchDeliveryJob,
  registerTouchDeliveryScheduler,
  touchDeliveryScheduler,
} from "./touch-delivery";

export {
  processSupportSyncJob,
  registerSupportSyncScheduler,
  supportSyncScheduler,
} from "./support-sync";

export {
  processSupportProcessJob,
  registerSupportProcessScheduler,
  supportProcessScheduler,
} from "./support-process";

export {
  processSupportSendJob,
  registerSupportSendScheduler,
  supportSendScheduler,
} from "./support-send";

export {
  googleAdsUploadScheduler,
  processGoogleAdsUploadJob,
  registerGoogleAdsUploadScheduler,
} from "./google-ads-upload";

export { processImageGenerationJob } from "./image-generation";
