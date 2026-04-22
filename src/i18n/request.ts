import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, locales, type Locale } from "./config";

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

async function resolveLocale(): Promise<Locale> {
  // 1. NEXT_LOCALE Cookie（用户显式选择，优先级最高）
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale && (locales as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as Locale;
  }

  // 2. Accept-Language 协商（按浏览器优先级取主语言）
  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language") ?? "";
  const negotiated = negotiateLocale(acceptLanguage);
  if (negotiated) return negotiated;

  // 3. 兜底默认语言
  return defaultLocale;
}

function negotiateLocale(acceptLanguage: string): Locale | null {
  if (!acceptLanguage) return null;
  const tags = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag] = part.trim().split(";");
      return tag?.trim().split("-")[0]?.toLowerCase() ?? "";
    })
    .filter(Boolean);

  for (const tag of tags) {
    if ((locales as readonly string[]).includes(tag)) {
      return tag as Locale;
    }
  }
  return null;
}
