import { NextResponse, type NextRequest } from "next/server";

const TRACKING_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "visitor_id",
  "aclid",
  "gclid",
  "wbraid",
  "gbraid",
] as const;

const COOKIE_EXPIRY_DAYS = 30;

const FIRST_TOUCH_COOKIE_KEYS = ["app_landing_path", "app_ref_host", "app_first_touch_at"] as const;

function safeRefHost(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.host || null;
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  const url = req.nextUrl;
  let changed = false;
  const res = NextResponse.next();

  // Note: We always capture UTM/attribution cookies regardless of consent.
  // Ad attribution is critical for a small business - we need accurate conversion tracking.
  // The cookie consent banner is still shown for EEA users for transparency.

  // Referral code capture (write-once): ?ref=XXXX -> cookie app_ref
  // We only store it for attribution at signup/login time; the actual binding is done server-side.
  if (!req.cookies.get("app_ref")?.value) {
    const ref = url.searchParams.get("ref");
    if (ref?.trim()) {
      res.cookies.set({
        name: "app_ref",
        value: ref.trim(),
        path: "/",
        sameSite: "lax",
        secure: false,
        maxAge: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
      });
    }
  }

  // First-touch capture (write-once): landing path + referrer host + timestamp.
  // This is crucial to split SEO vs direct when there is no utm/clickid.
  // Only set if not already present.
  const hasFirstTouch = FIRST_TOUCH_COOKIE_KEYS.every((k) => !!req.cookies.get(k)?.value);
  if (!hasFirstTouch) {
    if (!req.cookies.get("app_landing_path")?.value) {
      res.cookies.set({
        name: "app_landing_path",
        value: url.pathname || "/",
        path: "/",
        sameSite: "lax",
        secure: false,
        maxAge: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
      });
    }

    if (!req.cookies.get("app_ref_host")?.value) {
      const refHost = safeRefHost(req.headers.get("referer"));
      if (refHost) {
        res.cookies.set({
          name: "app_ref_host",
          value: refHost,
          path: "/",
          sameSite: "lax",
          secure: false,
          maxAge: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
        });
      }
    }

    if (!req.cookies.get("app_first_touch_at")?.value) {
      res.cookies.set({
        name: "app_first_touch_at",
        value: new Date().toISOString(),
        path: "/",
        sameSite: "lax",
        secure: false,
        maxAge: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
      });
    }
  }

  for (const key of TRACKING_QUERY_KEYS) {
    const value = url.searchParams.get(key);
    if (!value) continue;

    const cookieName = key === "visitor_id" ? "propeller_visitor_id" : key;
    if (req.cookies.get(cookieName)?.value) continue;

    res.cookies.set({
      name: cookieName,
      value,
      path: "/",
      sameSite: "lax",
      secure: false,
      maxAge: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
    });
    changed = true;
  }

  // If we set any UTM/click-id cookies, record a first-visit timestamp for attribution windows.
  if (changed && !req.cookies.get("utm_first_visit")?.value) {
    res.cookies.set({
      name: "utm_first_visit",
      value: new Date().toISOString(),
      path: "/",
      sameSite: "lax",
      secure: false,
      maxAge: COOKIE_EXPIRY_DAYS * 24 * 60 * 60,
    });
  }

  return res;
}

export const config = {
  matcher: [
    // Skip Next.js internals/static files
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|public/).*)",
  ],
};
