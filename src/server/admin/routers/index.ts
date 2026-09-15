import { createTRPCRouter } from "@/server/api/trpc";

// Users
import {
  listUsers,
  getUtmSources,
  getCountryCodes,
  getUser,
  getRelatedUsers,
  blockUser,
  unblockUser,
  setBlurBypass,
  deleteUser,
} from "./procedures/users";

// Credits
import {
  getUserCredits,
  grantCredits,
  deductCredits,
  listBillingRecords,
} from "./procedures/credits";

// Products
import {
  listProducts,
  getProduct,
  updateProduct,
  toggleProductAvailability,
} from "./procedures/products";

// Orders
import { listOrders, getOrder, getOrderStats } from "./procedures/orders";

// Affiliate
import {
  listAffiliatePayoutRequests,
  updateAffiliatePayoutRequest,
  listAffiliateCommissions,
  updateAffiliateCommissionStatus,
} from "./procedures/affiliate";

// Promo Codes
import {
  listPromoCodes,
  listPromoRedemptions,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
} from "./procedures/promo-codes";

// Offers
import { resetNewUserOffer } from "./procedures/offers";

// Touches
import {
  listTouchScenes,
  getTouchScene,
  createTouchScene,
  updateTouchScene,
  getTouchTemplate,
  createTouchTemplate,
  updateTouchTemplate,
  deleteTouchTemplate,
  listTouchSchedules,
  cancelTouchSchedule,
  getTouchScheduleDetails,
} from "./procedures/touches";

export const adminRouter = createTRPCRouter({
  // Users
  listUsers,
  getUtmSources,
  getCountryCodes,
  getUser,
  getRelatedUsers,
  blockUser,
  unblockUser,
  setBlurBypass,
  deleteUser,

  // Credits
  getUserCredits,
  grantCredits,
  deductCredits,
  listBillingRecords,

  // Products
  listProducts,
  getProduct,
  updateProduct,
  toggleProductAvailability,

  // Orders
  listOrders,
  getOrder,
  getOrderStats,

  // Affiliate
  listAffiliatePayoutRequests,
  updateAffiliatePayoutRequest,
  listAffiliateCommissions,
  updateAffiliateCommissionStatus,

  // Promo Codes
  listPromoCodes,
  listPromoRedemptions,
  createPromoCode,
  updatePromoCode,
  deletePromoCode,

  // Offers
  resetNewUserOffer,

  // Touches - Scenes
  listTouchScenes,
  getTouchScene,
  createTouchScene,
  updateTouchScene,

  // Touches - Templates
  getTouchTemplate,
  createTouchTemplate,
  updateTouchTemplate,
  deleteTouchTemplate,

  // Touches - Schedules
  listTouchSchedules,
  cancelTouchSchedule,
  getTouchScheduleDetails,
});
