"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { locales, type Locale } from "@/i18n/config";

export function AdminLanguageMenu() {
  const t = useTranslations("admin.shell");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function changeLocale(value: string) {
    if (value === locale || !locales.includes(value as Locale)) return;
    document.cookie = `NEXT_LOCALE=${value};path=/;max-age=31536000;SameSite=Lax`;
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="admin-language-trigger"
          disabled={pending}
          aria-label={t("changeLanguage")}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Languages className="size-4" />
          )}
          <span>{t(`languages.${locale === "zh" ? "zh" : "en"}`)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="admin-theme admin-popup min-w-40"
      >
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {t("language")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={locale} onValueChange={changeLocale}>
          {locales.map((language) => (
            <DropdownMenuRadioItem
              key={language}
              value={language}
              lang={language}
            >
              {t(`languages.${language}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
