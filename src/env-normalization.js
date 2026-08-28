import { z } from "zod";

/**
 * Resolve Auth.js v5 variables while preserving legacy NextAuth aliases.
 *
 * The first non-empty value wins: AUTH_* is canonical, but an empty AUTH_*
 * value must not hide a configured NEXTAUTH_* fallback.
 *
 * @param {Record<string, string | undefined>} sourceEnvironment
 */
export function normalizeAuthEnvironment(sourceEnvironment) {
  const authSecret =
    sourceEnvironment.AUTH_SECRET || sourceEnvironment.NEXTAUTH_SECRET;
  const authUrl = sourceEnvironment.AUTH_URL || sourceEnvironment.NEXTAUTH_URL;

  return {
    authSecret,
    authUrl,
    appUrl: sourceEnvironment.APP_URL || authUrl,
  };
}

/**
 * @param {string | undefined} nodeEnvironment
 */
export function createAuthSecretSchema(nodeEnvironment) {
  return nodeEnvironment === "production"
    ? z.string().min(1)
    : z.string().optional();
}

export const serviceModeSchema = z
  .enum([
    "web,worker",
    "all",
    "web",
    "api",
    "worker",
    "web,api",
    "web,api,worker",
  ])
  .optional()
  .default("web,worker");
