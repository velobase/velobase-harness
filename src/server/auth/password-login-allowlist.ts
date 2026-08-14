import { env } from "@/env";

export const PASSWORD_LOGIN_ALLOWLIST = (
  env.NEXT_PUBLIC_PASSWORD_LOGIN_EMAILS ?? ""
)
  .split(",")
  .map((email) => email.toLowerCase().trim())
  .filter(Boolean);

export function isPasswordLoginAllowed(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  return PASSWORD_LOGIN_ALLOWLIST.includes(normalized);
}
