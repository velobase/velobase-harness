/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { createLogger } from "@/lib/logger";
import { getUserRateLimiter, getRetryAfterSeconds, formatRateLimitMessage } from "@/server/ratelimit";
import { getSubscriptionStatus } from "@/server/membership/services/get-subscription-status";
import { getClientIpFromHeaders } from "@/server/lib/get-client-ip";

const logger = createLogger('trpc');

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  const clientIp = getClientIpFromHeaders(opts.headers);

  return {
    db,
    session,
    clientIp,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  logger.debug({ path, duration: end - start }, 'TRPC procedure executed');

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(async ({ ctx, next }) => {
    if (!ctx.session?.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const authzUser = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        isAdmin: true,
        isBlocked: true,
        isPrimaryDeviceAccount: true,
      },
    });

    if (!authzUser) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    if (authzUser.isBlocked) {
      throw new TRPCError({ 
        code: "FORBIDDEN", 
        message: "Your account has been suspended. Please contact support." 
      });
    }

    return next({
      ctx: {
        session: {
          ...ctx.session,
          user: {
            ...ctx.session.user,
            isAdmin: authzUser.isAdmin,
            isBlocked: authzUser.isBlocked,
            isPrimaryDeviceAccount: authzUser.isPrimaryDeviceAccount,
          },
        },
      },
    });
  });

/**
 * Admin only procedure
 *
 * Extends protectedProcedure to ensure the user has admin privileges.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.session.user.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next();
});

/**
 * Rate-limited procedure
 *
 * Extends protectedProcedure with user-level rate limiting based on subscription tier.
 * - Free tier: 20 requests/minute
 * - Plus/Premium tier: 120 requests/minute
 *
 * Returns 429 TOO_MANY_REQUESTS when limit is exceeded.
 *
 * @example
 * export const myProcedure = rateLimitedProcedure
 *   .input(z.object({ ... }))
 *   .query(async ({ ctx, input }) => { ... });
 */
export const rateLimitedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  try {
    // Get user's subscription tier
    const subStatus = await getSubscriptionStatus({ userId: ctx.session.user.id }).catch(() => ({ 
      status: 'NONE' as const 
    }));
    const tier = subStatus.status === 'NONE' ? 'FREE' : 'PLUS';
    
    // Apply rate limit based on tier
    const limiter = getUserRateLimiter(tier);
    await limiter.consume(ctx.session.user.id);
    
    return next();
  } catch (rejection) {
    const retryAfter = getRetryAfterSeconds(rejection);
    const subStatus = await getSubscriptionStatus({ userId: ctx.session.user.id }).catch(() => ({ 
      status: 'NONE' as const 
    }));
    const tier = subStatus.status === 'NONE' ? 'FREE' : 'PLUS';
    
    logger.warn({ 
      userId: ctx.session.user.id, 
      tier, 
      retryAfter 
    }, 'Rate limit exceeded');
    
    throw new TRPCError({ 
      code: "TOO_MANY_REQUESTS", 
      message: formatRateLimitMessage(tier, retryAfter),
    });
  }
});
