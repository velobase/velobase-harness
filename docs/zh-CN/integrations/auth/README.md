# 认证集成

认证使用 NextAuth，支持 Google、GitHub 等 OAuth providers，并结合框架登录 UI 和反滥用钩子。

## 使用

- Server Components 使用 `await auth()` from `@/server/auth`。
- Client Components 使用 `useSession()` from `next-auth/react`。
- 登录 UI 使用 `useLogin()` from `@/components/auth/use-login`。
- 不要在 client state 或 local storage 中保存敏感 auth data、JWT 或 session tokens。

## 配置

常见环境变量：

- `AUTH_SECRET` 和可选的 `AUTH_URL`（Auth.js v5 命名）。
- 为保持向后兼容，仍支持 `NEXTAUTH_SECRET` 和 `NEXTAUTH_URL`；两组同时配置时，
  首个非空的 `AUTH_*` 值优先；如果规范变量为空，则回退到已配置的 `NEXTAUTH_*` 别名。
- OAuth provider client IDs 和 secrets，例如 Google 或 GitHub keys。
- 登录流程发送邮件时，可能需要邮件或反滥用相关配置。

新增认证相关配置时，同步更新 `src/env.js` 和 `.env.example`。

## 扩展规则

- 新 provider 通过既有 auth configuration 边界添加。
- 除非所有调用方同步更新，否则保持 session shape 稳定。
- 产品页面不要绕过框架登录 UI 约定。
- 如果登录涉及 Turnstile、rate limiting、IP 或 disposable email checks，也要阅读 `docs/zh-CN/integrations/security/README.md`。
