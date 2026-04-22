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
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { MODULES } from "@/config/modules";

/* ------------------------------------------------------------------ */
/* Core routers — always present                                       */
/* ------------------------------------------------------------------ */
const coreRouters = {
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
};

/* ------------------------------------------------------------------ */
/* Optional routers — guarded by config flags                          */
/* ------------------------------------------------------------------ */
function loadOptionalRouters() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const optional: Record<string, any> = {};

  if (MODULES.features.aiChat.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { agentRouter } = require("@/server/api/routers/agent") as { agentRouter: unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { userAgentRouter } = require("@/server/api/routers/user-agent") as { userAgentRouter: unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { conversationRouter } = require("@/server/api/routers/conversation") as { conversationRouter: unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { projectRouter } = require("@/server/api/routers/project") as { projectRouter: unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { repositoryRouter } = require("@/server/api/routers/repository") as { repositoryRouter: unknown };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { githubRouter } = require("@/server/api/routers/github") as { githubRouter: unknown };
    optional.agent = agentRouter;
    optional.userAgent = userAgentRouter;
    optional.conversation = conversationRouter;
    optional.project = projectRouter;
    optional.repository = repositoryRouter;
    optional.github = githubRouter;
  }

  if (MODULES.features.affiliate.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { affiliateRouter } = require("@/server/api/routers/affiliate") as { affiliateRouter: unknown };
    optional.affiliate = affiliateRouter;
  }

  if (MODULES.integrations.messaging.telegram.enabled) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { telegramRouter } = require("@/server/telegram/router") as { telegramRouter: unknown };
    optional.telegram = telegramRouter;
  }

  return optional;
}

export const appRouter = createTRPCRouter({
  ...coreRouters,
  ...loadOptionalRouters(),
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
