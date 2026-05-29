"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AppLogo } from "@/components/ui/app-logo";
import { Button } from "@/components/ui/button";
import { ShieldX, Trash2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { supportMailto } from "@/config/brand";

export default function BlockedPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDeleted = searchParams.get("reason") === "deleted";
  const isSignupDisabled = searchParams.get("reason") === "signup_disabled";

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex max-w-md flex-col items-center gap-6 px-6 text-center">
        <AppLogo size="lg" />

        <div className={`flex h-16 w-16 items-center justify-center rounded-full ${
          isDeleted || isSignupDisabled
            ? "bg-slate-100 dark:bg-slate-800"
            : "bg-red-100 dark:bg-red-900/30"
        }`}>
          {isDeleted ? (
            <Trash2 className="h-8 w-8 text-slate-600 dark:text-slate-400" />
          ) : isSignupDisabled ? (
            <ShieldX className="h-8 w-8 text-slate-600 dark:text-slate-400" />
          ) : (
            <ShieldX className="h-8 w-8 text-red-600 dark:text-red-400" />
          )}
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isDeleted
              ? t("accountDeleted")
              : isSignupDisabled
                ? t("signUpDisabled")
                : t("accountSuspended")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isDeleted
              ? t("accountDeletedDesc")
              : isSignupDisabled
                ? t("signUpDisabledDesc")
                : t("accountSuspendedDesc")}
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full">
          {!isDeleted && !isSignupDisabled && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.href = supportMailto()}
            >
              <Mail className="mr-2 h-4 w-4" />
              {tCommon("contactSupport")}
            </Button>
          )}

          <Button
            variant={isDeleted ? "default" : "ghost"}
            className={isDeleted ? "w-full" : "w-full text-muted-foreground"}
            onClick={() => router.push("/")}
          >
            {tCommon("returnToHome")}
          </Button>
        </div>
      </div>
    </div>
  );
}
