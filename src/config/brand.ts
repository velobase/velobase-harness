export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "SaaS App";
export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@yourdomain.com";

export function supportMailto(subject?: string) {
  const suffix = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${SUPPORT_EMAIL}${suffix}`;
}
