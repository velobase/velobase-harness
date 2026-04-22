import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import CredentialsProvider from "next-auth/providers/credentials";
import { oauthProviders, isOAuthProvider } from "./providers";
import { cookies, headers } from "next/headers";

import { env } from "@/env";
import { db } from "@/server/db";
import { grant } from "@/server/billing/services/grant";
import { logger } from "@/lib/logger";
import { sendEmail, MagicLinkEmailTemplate, renderMagicLinkHtml } from "@/server/email";
import { checkAuthRateLimit } from "@/server/ratelimit";
import { getServerPostHog } from "@/analytics/server";
import { AUTH_EVENTS } from "@/analytics/events/auth";
import { isFamousEmailDomain } from "./disposable-domains";
import { normalizeEmail } from "./normalize-email";
import { CustomPrismaAdapter } from "./prisma-adapter";
import { checkSignupAbuse, enforceSignupAbuse } from "@/server/features/anti-abuse";
import { getClientIpFromHeaders } from "@/server/features/cdn-adapters";
import { verifyPassword } from "./password";
import { isPasswordLoginAllowed } from "./password-login-allowlist";
import { SIGNUP_DISABLED } from "@/config/decommission";

function classifyFirstTouch(params: {
  refHost?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
  adClickId?: string | null;
}): { refType: string; channel: string } {
  const refHost = (params.refHost ?? "").toLowerCase();
  const utmMedium = (params.utmMedium ?? "").toLowerCase();
  const utmSource = (params.utmSource ?? "").toLowerCase();
  const hasAd = !!params.adClickId;

  const isPaid = hasAd || ["cpc", "ppc", "paid", "paidsearch", "display"].includes(utmMedium);
  if (isPaid) return { refType: "unknown", channel: "paid_search" };

  const isSearchRef =
    refHost === "www.google.com" ||
    refHost === "google.com" ||
    refHost.endsWith(".google.com") ||
    refHost === "bing.com" ||
    refHost === "www.bing.com" ||
    refHost === "duckduckgo.com" ||
    refHost === "www.duckduckgo.com";

  if (isSearchRef) return { refType: "search", channel: "organic_search" };
  if (refHost) return { refType: "referral", channel: "referral" };

  // No referrer: direct or stripped
  if (utmSource || utmMedium) return { refType: "unknown", channel: "unknown" };
  return { refType: "direct", channel: "direct" };
}

async function ensureSignupEnabledOrExistingUser(email: string): Promise<void> {
  if (!SIGNUP_DISABLED) return;
  const e = email.toLowerCase().trim();
  const normalized = normalizeEmail(e);
  const existing = await db.user.findFirst({
    where: {
      OR: [{ email: e }, { canonicalEmail: normalized }],
    },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("SIGNUP_DISABLED:Sign up is temporarily disabled.");
  }
}

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      isAdmin: boolean;
      isBlocked: boolean;
      isPrimaryDeviceAccount?: boolean;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  // Required when running behind a reverse proxy (K8s Ingress / Nginx).
  // Tells Auth.js to trust the X-Forwarded-Host header so the session
  // endpoint works correctly at https://<subdomain>.velobase.app
  trustHost: true,
  providers: [
    ...oauthProviders,

    /**
     * Password Login Provider (仅白名单邮箱)
     * - 用于空中云汇等合作方测试
     * - 只允许 password-login-allowlist.ts 中配置的邮箱
     * - 审核完成后清空白名单即可关闭
     */
    CredentialsProvider({
      id: "credentials",
      name: "Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        // 1. 强制白名单检查
        if (!isPasswordLoginAllowed(email)) {
          logger.warn({ email }, "Password login attempt for non-allowlisted email");
          throw new Error("Password login is not available for this account");
        }

        // 2. 查用户
        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true,
            isBlocked: true,
            isAdmin: true,
            isPrimaryDeviceAccount: true,
            createdAt: true,
          },
        });

        if (!user) {
          logger.warn({ email }, "Password login: user not found");
          throw new Error("Invalid email or password");
        }

        if (user.isBlocked) {
          throw new Error("Your account has been suspended");
        }

        if (!user.passwordHash) {
          logger.warn({ email }, "Password login: no password set for user");
          throw new Error("Invalid email or password");
        }

        // 3. 校验密码
        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          logger.warn({ email }, "Password login: invalid password");
          throw new Error("Invalid email or password");
        }

        logger.info({ email, userId: user.id }, "Password login successful");

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isAdmin: user.isAdmin,
          isBlocked: user.isBlocked,
          isPrimaryDeviceAccount: user.isPrimaryDeviceAccount,
          createdAt: user.createdAt,
        };
      },
    }),

    /**
     * Email Provider (Magic Link)
     * - Sends a secure one-time link to the user's email
     * - Link expires in 15 minutes
     * - Rate limited: 3 per hour per email, 10 per hour per IP
     */
    Nodemailer({
      // Resend SMTP config
      server: {
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: { 
          user: "resend", 
          pass: process.env.RESEND_API_KEY ?? "" 
        },
      },
      from: process.env.EMAIL_FROM ?? "App <noreply@example.com>",
      // Magic Link expires in 15 minutes
      maxAge: 15 * 60,
      // Custom email sending via Resend SDK with rate limiting
      sendVerificationRequest: async ({ identifier: email, url }) => {
        // Get client IP for rate limiting
        const headersList = await headers();
        const ip = getClientIpFromHeaders(headersList);

        // Check rate limits
        const rateLimitResult = await checkAuthRateLimit(email, ip);
        if (!rateLimitResult.allowed) {
          logger.warn(
            { email, ip, reason: rateLimitResult.reason },
            "Auth rate limit exceeded"
          );
          throw new Error(
            `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds.`
          );
        }

        // Signup is disabled: only allow existing users to request magic link
        await ensureSignupEnabledOrExistingUser(email);

        // 邮箱风控守卫（临时邮箱 / Gmail tricks / 封禁检查 / Turnstile）
        const { guardEmail } = await import("@/server/features/anti-abuse");
        await guardEmail(email, ip);

        try {
          await sendEmail({
            to: email,
            subject: "Sign in to AI SaaS App",
            react: MagicLinkEmailTemplate({ url }),
            html: renderMagicLinkHtml(url),
            text: `Sign in to AI SaaS App\n\nClick the link below:\n${url}\n\nThis link expires in 15 minutes.`,
          });
          logger.info({ email }, "Magic link email sent");

          // Track successful email send (non-blocking)
          const posthog = getServerPostHog();
          if (posthog) {
            posthog.capture({
              distinctId: email, // Use email as distinctId before user is created
              event: AUTH_EVENTS.EMAIL_SENT,
              properties: { success: true },
            });
            void posthog.shutdown();
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error({ email, errorMessage: errMsg }, `Failed to send magic link email: ${errMsg}`);

          // Track failed email send (non-blocking)
          const posthog = getServerPostHog();
          if (posthog) {
            posthog.capture({
              distinctId: email,
              event: AUTH_EVENTS.EMAIL_SENT,
              properties: { success: false, error_reason: errMsg },
            });
            void posthog.shutdown();
          }

          throw new Error("Failed to send verification email. Please try again.");
        }
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
  },
  adapter: CustomPrismaAdapter(db),
  secret: env.NEXTAUTH_SECRET,
  // Cookie secure 属性：
  // - Cloudflare Flexible SSL (CF → HTTP → 源站): 必须 secure=false
  // - 开发环境 (localhost HTTP): 必须 secure=false
  // - 生产 Full SSL / 直连 HTTPS: secure=true
  // 通过 COOKIE_SECURE env var 覆盖，或自动推断（非生产 = false）
  cookies: (() => {
    const secure = process.env.COOKIE_SECURE === 'true'
      ? true
      : process.env.COOKIE_SECURE === 'false'
        ? false
        : process.env.NODE_ENV === 'production';
    return {
      sessionToken: {
        name: `next-auth.session-token`,
        options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
      },
      callbackUrl: {
        name: `next-auth.callback-url`,
        options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
      },
      csrfToken: {
        name: `next-auth.csrf-token`,
        options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure },
      },
      pkceCodeVerifier: {
        name: `next-auth.pkce.code_verifier`,
        options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure, maxAge: 900 },
      },
      state: {
        name: `next-auth.state`,
        options: { httpOnly: true, sameSite: 'lax' as const, path: '/', secure, maxAge: 900 },
      },
    };
  })(),
  events: {
    signIn: async ({ user, account, isNewUser }) => {
      if (!user.id || !account) return;

      // 新用户 + 非著名邮箱：发放登录奖励 299 积分
      if (isNewUser && user.email) {
        const isFamousEmail = isFamousEmailDomain(user.email);
        const isEmailLogin = !isOAuthProvider(account.provider);
        
        // 读取 utm_source 判断是否是自然流量
        const cookieStore = await cookies();
        const utmSource = cookieStore.get("utm_source")?.value;

        // Affiliate referral binding (write-once, permanent)
        // - cookie set in middleware.ts: app_ref
        // - only bind on new user
        // - ignore invalid/self-ref
        try {
          const refCodeRaw = cookieStore.get("app_ref")?.value ?? null;
          const refCode = refCodeRaw ? refCodeRaw.trim() : null;
          if (refCode) {
            const referrer = await db.user.findUnique({
              where: { referralCode: refCode },
              select: { id: true },
            });

            if (referrer?.id && referrer.id !== user.id) {
              // Only set if not already set (idempotent)
              await db.user.updateMany({
                where: { id: user.id, referredById: null },
                data: { referredById: referrer.id },
              });
            }
          }
        } catch (error) {
          logger.warn({ error, userId: user.id }, "Failed to bind referral for new user (ignored)");
        }

        // 设备检测必须在积分计算之前完成：确保 isPrimaryDeviceAccount 值正确（共享设备的第二个新账号应为 false）
        let isPrimaryDeviceAccount = true;
        try {
          const deviceKey = cookieStore.get("app_device_key")?.value ?? null;
          if (deviceKey) {
            const firstUserOnDevice = await db.user.findFirst({
              where: { deviceKeyAtSignup: deviceKey },
              orderBy: { createdAt: "asc" },
              select: { id: true },
            });

            if (firstUserOnDevice && firstUserOnDevice.id !== user.id) {
              isPrimaryDeviceAccount = false;
            }

            await db.user.update({
              where: { id: user.id },
              data: { deviceKeyAtSignup: deviceKey, isPrimaryDeviceAccount },
            });
          }
        } catch (error) {
          logger.warn({ error, userId: user.id }, "Failed to run device detection before initial grant");
        }

        // 同 IP 触发"待审核锁定额度"（优化：时间窗 + 设备信号，避免 NAT/公司网历史账号误伤）
        let shouldLockPendingCredits = false;
        let emailAbuseDecision:
          | { isAbuse: boolean; reason?: string; existingEmails?: string[] }
          | null = null;
        let remoteIp: string | null = null;
        try {
          const headersList = await headers();
          const resolvedIp = getClientIpFromHeaders(headersList);
          remoteIp = resolvedIp === 'unknown' ? null : resolvedIp;

          if (remoteIp) {
            await db.user.update({
              where: { id: user.id },
              data: { signupIp: remoteIp },
            });

            emailAbuseDecision = await checkSignupAbuse({
              userId: user.id,
              email: user.email,
              signupIp: remoteIp,
            });
            shouldLockPendingCredits = emailAbuseDecision.isAbuse;
          }
        } catch (error) {
          logger.warn({ error, userId: user.id }, "Failed to run same-IP fast gate in signIn");
        }

        try {
          const grantKey = normalizeEmail(user.email);
          let amount = 0;
          let description = "";

          // flip_hkd 开头的邮箱：只给 299
          if (user.email.toLowerCase().startsWith('flip_hkd')) {
            amount = 299;
            description = "Login Bonus: 299 Credits";
          } else if (isFamousEmail) {
            // 著名邮箱用户
            if (isEmailLogin && !utmSource) {
              // Email 登录 + 无 utm_source = 可疑，只给 300
              // 非主账号仍只给 100
              amount = isPrimaryDeviceAccount ? 300 : 100;
              description = isPrimaryDeviceAccount
                ? "Welcome Gift: 300 Credits"
                : "Welcome Gift: 100 Credits";
              logger.info(
                {
                  userId: user.id,
                  email: user.email,
                  isEmailLogin,
                  utmSource,
                  isPrimaryDeviceAccount,
                  shouldLockPendingCredits,
                  emailAbuseReason: emailAbuseDecision?.reason,
                },
                "Reduced credits for email login without utm_source",
              );
            } else {
              // Google OAuth 或有 utm_source：正常发放
              // 主账号 600，非主账号 100（防滥用）
              amount = isPrimaryDeviceAccount ? 600 : 100;
              description = isPrimaryDeviceAccount
                ? "Welcome Gift: 600 Credits"
                : "Welcome Gift: 100 Credits";
            }
          } else {
            // 非著名邮箱：只给 299
            amount = 299;
            description = "Login Bonus: 299 Credits";
          }

          if (amount > 0) {
            // 全额发放初始积分（Velobase 不支持 PENDING 状态，统一全额发放）
            await grant({
              userId: user.id,
              accountType: "CREDIT",
              subAccountType: "FIRST_LOGIN",
              amount,
              outerBizId: `initial_grant_${grantKey}`,
              businessType: "ADMIN_GRANT",
              description,
            });

            logger.info(
              { userId: user.id, grantKey, amount, isFamousEmail, isEmailLogin, utmSource, isPrimaryDeviceAccount },
              "Granted initial credits to new user",
            );

            // 命中风控：异步检测滥用，如确认滥用则通过 Velobase deduct 回收
            if (shouldLockPendingCredits && remoteIp) {
              void enforceSignupAbuse(user.id, user.email, remoteIp, emailAbuseDecision ?? undefined);
            }
          }
        } catch (error) {
          // If grant fails due to duplicate outerBizId, it means this normalized email already got credits
          logger.error({ error, userId: user.id }, "Failed to grant initial credits (may be duplicate)");
        }
      }

      // Track login success (non-blocking)
      const posthog = getServerPostHog();
      if (!posthog) return;

      const method = isOAuthProvider(account.provider) ? account.provider : "email";

      // For email magic link flow, mark that the user clicked the link
      if (method === "email") {
        posthog.capture({
          distinctId: user.id,
          event: AUTH_EVENTS.EMAIL_LINK_CLICK,
        });
      }

      posthog.capture({
        distinctId: user.id,
        event: AUTH_EVENTS.LOGIN_SUCCESS,
        properties: {
          method,
          is_new_user: isNewUser ?? false,
        },
      });

      // Also alias email to user ID for proper user tracking
      if (user.email) {
        posthog.alias({ distinctId: user.id, alias: user.email });
      }

      // Update Ad attribution for returning users (if they have a new ad click)
      try {
        const cookieStore = await cookies();
        const gclid = cookieStore.get("gclid")?.value;
        const wbraid = cookieStore.get("wbraid")?.value;
        const gbraid = cookieStore.get("gbraid")?.value;
        
        let adClickId: string | undefined;
        let adClickProvider: string | null = null;

        if (gclid) {
          adClickId = gclid;
          adClickProvider = "gclid";
        } else if (wbraid) {
          adClickId = wbraid;
          adClickProvider = "wbraid";
        } else if (gbraid) {
          adClickId = gbraid;
          adClickProvider = "gbraid";
        }
        
        if (adClickId) {
           // Only update if we have a new click ID
           await db.user.update({
            where: { id: user.id },
            data: {
              adClickId,
              adClickProvider, // "gclid", "wbraid", or "gbraid"
              adClickTime: new Date(),
            },
          });
          logger.info(
            { userId: user.id, adClickId },
            "Updated Ad attribution for returning user",
          );
        }
      } catch (error) {
        logger.warn({ error, userId: user.id }, "Failed to update Ad attribution");
      }

      void posthog.shutdown();
    },
    createUser: async ({ user }) => {
      if (!user.id) return;

      // 记录注册 IP
      let signupIp: string | null = null;
      try {
        const headersList = await headers();
        const resolvedSignupIp = getClientIpFromHeaders(headersList);
        signupIp = resolvedSignupIp === 'unknown' ? null : resolvedSignupIp;

        if (signupIp) {
          await db.user.update({
            where: { id: user.id },
            data: { signupIp },
          });
          logger.info({ userId: user.id, signupIp }, "Recorded signup IP for new user");

          // email-abuse 复核已移至 signIn：只有在同IP命中且产生 PENDING 锁定额度时才触发
        }
      } catch (error) {
        logger.warn({ error, userId: user.id }, "Failed to record signup IP");
      }

      // 设备检测：判断是否是该设备上的第一个账号
      try {
        // 读取设备 device key（由前端写入 localStorage + cookie）
        const cookieStore = await cookies();
        const deviceKey = cookieStore.get("app_device_key")?.value ?? null;

        // 判断当前用户是否是该设备上的第一个账号：
        // - 在 User 表中查找最早的同 deviceKey 用户
        // - 如果不存在，或者属于当前用户 => 视为第一账号
        let isPrimaryDeviceAccount = true;

        if (deviceKey) {
          const firstUserOnDevice = await db.user.findFirst({
            where: {
              deviceKeyAtSignup: deviceKey,
            },
            orderBy: {
              createdAt: "asc",
            },
          });

          if (firstUserOnDevice && firstUserOnDevice.id !== user.id) {
            isPrimaryDeviceAccount = false;
          }

          // 如果用户已被其他逻辑（例如同IP快速门槛）降级为非主账号，则这里不要覆盖回 true
          const current = await db.user.findUnique({
            where: { id: user.id },
            select: { isPrimaryDeviceAccount: true },
          });
          const finalIsPrimary = (current?.isPrimaryDeviceAccount ?? true) && isPrimaryDeviceAccount;

          // 把 device key 和「是否首账号」写回 User 表，供后续 signIn 事件和日滴逻辑使用
          await db.user.update({
            where: { id: user.id },
            data: {
              deviceKeyAtSignup: deviceKey,
              isPrimaryDeviceAccount: finalIsPrimary,
            },
          });

          logger.info(
            { userId: user.id, deviceKey, isPrimaryDeviceAccount: finalIsPrimary },
            "Device detection completed for new user",
          );
        }
      } catch (error) {
        logger.warn({ error, userId: user.id }, "Failed to run device detection for new user");
      }
      // 注：积分发放统一在 signIn 事件中处理，避免重复发放

      // Save UTM attribution data from cookies
      try {
        const cookieStore = await cookies();
        const utmSource = cookieStore.get("utm_source")?.value;
        const utmMedium = cookieStore.get("utm_medium")?.value;
        const utmCampaign = cookieStore.get("utm_campaign")?.value;
        const utmTerm = cookieStore.get("utm_term")?.value;
        const utmContent = cookieStore.get("utm_content")?.value;

        // Google Ads Capture
        const gclid = cookieStore.get("gclid")?.value;
        const wbraid = cookieStore.get("wbraid")?.value;
        const gbraid = cookieStore.get("gbraid")?.value;

        // First-touch capture (from middleware)
        const landingPath = cookieStore.get("app_landing_path")?.value;
        const refHost = cookieStore.get("app_ref_host")?.value;
        const firstTouchAtRaw = cookieStore.get("app_first_touch_at")?.value;
        
        let adClickId: string | undefined;
        let adClickProvider: string | null = null;

        if (gclid) {
          adClickId = gclid;
          adClickProvider = "gclid";
        } else if (wbraid) {
          adClickId = wbraid;
          adClickProvider = "wbraid";
        } else if (gbraid) {
          adClickId = gbraid;
          adClickProvider = "gbraid";
        }

        if (utmSource || utmMedium || utmCampaign || adClickId) {
          await db.user.update({
            where: { id: user.id },
            data: {
              utmSource,
              utmMedium,
              utmCampaign,
              utmTerm,
              utmContent,
              // Ad Tracking
              adClickId,
              adClickProvider, // "gclid", "wbraid", or "gbraid"
              adClickTime: adClickId ? new Date() : undefined,
            },
          });
          logger.info(
            { userId: user.id, utmSource, utmMedium, utmCampaign, adClickId },
            "Saved UTM and Ad attribution for new user",
          );
        }

        // Save first-touch attribution (wrapped in try/catch so it won't break before DB migration).
        const firstTouchAt =
            firstTouchAtRaw && !Number.isNaN(Date.parse(firstTouchAtRaw)) ? new Date(firstTouchAtRaw) : new Date();
          const { refType, channel } = classifyFirstTouch({
            refHost,
            utmMedium,
            utmSource,
            adClickId: adClickId ?? null,
          });

            await db.userAttribution.upsert({
              where: { userId: user.id },
              create: {
                userId: user.id,
                firstTouchAt,
                landingPath: landingPath ?? null,
                refHost: refHost ?? null,
                refType,
                channel,
                utmSource: utmSource ?? null,
                utmMedium: utmMedium ?? null,
                utmCampaign: utmCampaign ?? null,
                utmTerm: utmTerm ?? null,
                utmContent: utmContent ?? null,
                adClickId: adClickId ?? null,
                adClickProv: adClickProvider ?? null,
              },
              update: {},
            });
            logger.info(
              { userId: user.id, channel, refHost, landingPath },
              "Saved first-touch user attribution",
            );
      } catch (error) {
        logger.error({ error, userId: user.id }, "Failed to save UTM attribution");
      }
    },
  },
  // 使用 JWT session 策略以支持 CredentialsProvider
  session: {
    strategy: "jwt",
  },
  callbacks: {
    // JWT callback: 将用户信息写入 token
    jwt: async ({ token, user, account }) => {
      // 首次登录时 user 和 account 存在
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        token.isBlocked = (user as { isBlocked?: boolean }).isBlocked ?? false;
        token.isPrimaryDeviceAccount = (user as { isPrimaryDeviceAccount?: boolean }).isPrimaryDeviceAccount;
        token.createdAt = (user as { createdAt?: Date }).createdAt ?? new Date(0);
      }
      // credentials provider 不会自动填充 user，需要从 DB 读
      if (account?.provider === "credentials" && token.sub) {
        const dbUser = await db.user.findUnique({
          where: { id: token.sub },
          select: { id: true, isAdmin: true, isBlocked: true, isPrimaryDeviceAccount: true, createdAt: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.isAdmin = dbUser.isAdmin ?? false;
          token.isBlocked = dbUser.isBlocked ?? false;
          token.isPrimaryDeviceAccount = dbUser.isPrimaryDeviceAccount;
          token.createdAt = dbUser.createdAt ?? new Date(0);
        }
      }
      return token;
    },

    // Session callback: 从 JWT token 构建 session
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.id as string ?? token.sub,
        isAdmin: token.isAdmin as boolean ?? false,
        isBlocked: token.isBlocked as boolean ?? false,
        isPrimaryDeviceAccount: token.isPrimaryDeviceAccount as boolean | undefined,
        createdAt: token.createdAt as Date ?? new Date(0),
      },
    }),

    signIn: async ({ user }) => {
      // Disable signup: only allow existing users to sign in
      if (SIGNUP_DISABLED) {
        // Credentials provider always has a user.id, and it must exist already.
        if (user.id) {
          const existing = await db.user.findUnique({
            where: { id: user.id },
            select: { id: true },
          });
          if (!existing) {
            return "/auth/blocked?reason=signup_disabled";
          }
        } else if (user.email) {
          const e = user.email.toLowerCase().trim();
          const normalized = normalizeEmail(e);
          const existing = await db.user.findFirst({
            where: {
              OR: [{ email: e }, { canonicalEmail: normalized }],
            },
            select: { id: true },
          });
          if (!existing) {
            return "/auth/blocked?reason=signup_disabled";
          }
        } else {
          return "/auth/blocked?reason=signup_disabled";
        }
      }

      // Check if user is blocked (for existing users only)
      if (user.id) {
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { isBlocked: true, blockedReason: true },
        });
        if (dbUser?.isBlocked) {
          // User-requested deletion shows different message
          if (dbUser.blockedReason === "USER_REQUESTED") {
            return "/auth/blocked?reason=deleted";
          }
          return "/auth/blocked";
        }
      }
      return true;
    },
    redirect: ({ url, baseUrl }) => {
      // Allow relative URLs
      if (url.startsWith("/")) return url;

      // Allow same-origin absolute URLs
      try {
        const nextUrl = new URL(url);
        const base = new URL(baseUrl);
        if (nextUrl.origin === base.origin) {
          return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
        }
      } catch {
        // fall through to baseUrl
      }

      // Fallback: safe home
      return baseUrl;
    },
  },
} satisfies NextAuthConfig;