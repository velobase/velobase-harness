import { outreachRouter } from "@/modules/outreach/server/router";
import { emailManagementRouter } from "@/modules/email-management/server/router";
import { sharingAdminRouter } from "@/server/features/sharing";
import { featuresRouter } from "@/server/features/router";
import { storageRouter } from "@/server/api/routers/storage";
import { productRouter } from "@/server/product/routers";
import { billingRouter } from "@/server/billing/routers";
import { orderRouter } from "@/server/order/routers";
import { membershipRouter } from "@/server/membership/routers";
import { promoRouter } from "@/server/promo/routers";
import { adminRouter } from "@/server/admin/routers";
import { accountRouter } from "@/server/api/routers/account";
import { notificationRouter } from "@/server/api/routers/notification";
import { exampleRouter } from "@/modules/example/server/router";
import { agentRouter } from "@/server/api/routers/agent";
import { userAgentRouter } from "@/server/api/routers/user-agent";
import { conversationRouter } from "@/server/api/routers/conversation";
import { projectRouter } from "@/server/api/routers/project";
import { repositoryRouter } from "@/server/api/routers/repository";
import { githubRouter } from "@/server/api/routers/github";
import { integrationDiagnosticsRouter } from "@/server/api/routers/integration-diagnostics";
import { affiliateRouter } from "@/server/api/routers/affiliate";
import { telegramRouter } from "@/server/telegram/router";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

/**
 * Complete-example compatibility composition. Its static router types include the
 * legacy business surface. Deployment-membership and operation guards deny omitted
 * or disabled capabilities before procedure execution; history/settlement policies
 * are explicit. Small hosts own separate routes and dependency closures instead of
 * importing this router. See docs/en/modules/composition.md.
 */
export const appRouter = createTRPCRouter({
  outreach: outreachRouter,
  emailManagement: emailManagementRouter,
  features: featuresRouter,
  sharingAdmin: sharingAdminRouter,
  // Complete example business and framework routers
  admin: adminRouter,
  storage: storageRouter,
  product: productRouter,
  billing: billingRouter,
  order: orderRouter,
  membership: membershipRouter,
  promo: promoRouter,
  notification: notificationRouter,
  account: accountRouter,
  example: exampleRouter,

  // AI Chat module
  agent: agentRouter,
  userAgent: userAgentRouter,
  conversation: conversationRouter,
  project: projectRouter,
  repository: repositoryRouter,
  github: githubRouter,
  integrationDiagnostics: integrationDiagnosticsRouter,

  // Affiliate module
  affiliate: affiliateRouter,

  // Telegram module
  telegram: telegramRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
