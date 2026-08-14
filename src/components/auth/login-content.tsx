"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Script from "next/script";
import { Mail, ArrowLeft, Loader2, Eye, EyeOff, KeyRound } from "lucide-react";
import { AppLogo } from "@/components/ui/app-logo";
import { cn } from "@/lib/utils";
import { useLogin, TURNSTILE_SITE_KEY } from "./use-login";
import { OAUTH_PROVIDERS } from "./oauth-providers";
import { useTranslations } from "next-intl";

// ============ Sub-components ============

const PromotionBadge = () => null;

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
}

const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({ onSuccess }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rendered, setRendered] = useState(false);

  const renderWidget = useCallback(() => {
    if (typeof window === "undefined") return;
    if (
      !(
        window as unknown as {
          turnstile?: {
            render: (
              container: HTMLElement,
              options: { sitekey: string; callback: (token: string) => void },
            ) => void;
          };
        }
      ).turnstile
    )
      return;
    if (!containerRef.current) return;
    if (rendered) return;

    (
      window as unknown as {
        turnstile: {
          render: (
            container: HTMLElement,
            options: { sitekey: string; callback: (token: string) => void },
          ) => void;
        };
      }
    ).turnstile.render(containerRef.current, {
      sitekey: TURNSTILE_SITE_KEY ?? "",
      callback: (token: string) => {
        onSuccess(token);
        if (typeof document !== "undefined") {
          document.cookie = `cf_turnstile_token=${token}; path=/; max-age=600`;
        }
      },
    });
    setRendered(true);
  }, [rendered, onSuccess]);

  useEffect(() => {
    renderWidget();
  }, [renderWidget]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        async
        defer
        onLoad={renderWidget}
      />
      <div ref={containerRef} className="mt-2" />
    </>
  );
};

// ============ Views ============

interface LoginContentProps {
  TitleComponent?: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  DescriptionComponent?: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
}

export function LoginContent({
  TitleComponent,
  DescriptionComponent,
}: LoginContentProps) {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const login = useLogin();

  const Title =
    TitleComponent ??
    (({
      className,
      children,
    }: {
      className?: string;
      children: React.ReactNode;
    }) => <h2 className={className}>{children}</h2>);
  const Description =
    DescriptionComponent ??
    (({
      className,
      children,
    }: {
      className?: string;
      children: React.ReactNode;
    }) => <p className={className}>{children}</p>);

  // ============ Main View ============
  if (login.view === "main") {
    return (
      <div className="animate-in fade-in zoom-in-95 flex flex-col items-center p-8 pt-10 duration-300">
        <div className="mb-6 scale-110">
          <AppLogo size="lg" />
        </div>

        <div className="mb-8 flex flex-col items-center gap-2">
          <Title className="text-center text-2xl font-bold tracking-tight">
            {t("welcomeTitle")}
          </Title>
          <Description className="text-muted-foreground text-center text-base">
            {t("welcomeSubtitle")}
          </Description>
          <div className="mt-2">
            <PromotionBadge />
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              onClick={() => login.handleOAuthLogin(provider.id)}
              className="group relative flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-[15px] font-medium text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
            >
              {provider.logo}
              <span>{t("continueWith", { provider: provider.name })}</span>
            </button>
          ))}

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100 dark:border-slate-800/60" />
            </div>
            <div className="relative flex justify-center bg-white px-3 text-[11px] font-medium tracking-wider text-slate-400 uppercase dark:bg-slate-950">
              {t("or")}
            </div>
          </div>

          <button
            onClick={login.handleEmailMethodSelect}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-transparent bg-slate-50 px-4 text-[15px] font-medium text-slate-600 transition-all duration-200 hover:bg-slate-100 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Mail className="h-[18px] w-[18px]" />
            <span>{t("continueWithEmail")}</span>
          </button>
        </div>

        <p className="text-muted-foreground mt-8 px-6 text-center text-[11px]">
          {t("termsAgreement")}
        </p>
      </div>
    );
  }

  // ============ Email View ============
  if (login.view === "email") {
    return (
      <div className="animate-in slide-in-from-right-8 fade-in p-8 pt-6 duration-300">
        <button
          onClick={login.handleBack}
          className="mb-6 -ml-1 flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {tCommon("back")}
        </button>

        <div className="mb-8">
          <Title className="mb-2 text-xl font-bold">
            {t("signInWithEmail")}
          </Title>
          <Description className="text-muted-foreground text-base">
            {login.isPasswordMode ? t("enterPasswordDesc") : t("emailCodeDesc")}
          </Description>
        </div>

        <form onSubmit={login.handleFormSubmit} className="relative space-y-4">
          <div className="relative space-y-1.5">
            <label
              htmlFor="email"
              className="ml-1 text-xs font-medium tracking-wider text-slate-500 uppercase"
            >
              {t("emailLabel")}
            </label>
            <input
              id="email"
              type="email"
              value={login.email}
              onChange={(e) => login.handleEmailChange(e.target.value)}
              onBlur={(e) => login.handleEmailBlur(e.target.value)}
              onKeyDown={login.handleAutocompleteKeyDown}
              placeholder={t("emailPlaceholder")}
              className={cn(
                "h-12 w-full rounded-xl border bg-white px-4 text-[16px] transition-all duration-200 outline-none dark:bg-slate-900",
                login.error
                  ? "border-red-300 text-red-900 placeholder:text-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
                  : "border-slate-200 placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 dark:border-slate-800",
              )}
              disabled={login.isLoading}
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
            />

            {login.showAutocomplete && login.suggestions.length > 0 && (
              <div
                ref={login.autocompleteRef}
                className="absolute top-[calc(100%+4px)] right-0 left-0 z-50 max-h-[240px] overflow-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950"
              >
                {login.suggestions.map((suggestion, idx) => (
                  <div
                    key={suggestion}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      login.handleAutocompleteSuggestionClick(suggestion);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm transition-colors",
                      idx === login.autocompleteIndex
                        ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-900",
                    )}
                  >
                    <span className="font-medium">
                      {suggestion.split("@")[0]}
                    </span>
                    <span className="text-slate-400">
                      @{suggestion.split("@")[1]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-out",
              login.isPasswordMode
                ? "max-h-24 opacity-100"
                : "max-h-0 opacity-0",
            )}
          >
            <div className="space-y-1.5 pt-1">
              <label
                htmlFor="password"
                className="ml-1 text-xs font-medium tracking-wider text-slate-500 uppercase"
              >
                {t("passwordLabel")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={login.showPassword ? "text" : "password"}
                  value={login.password}
                  onChange={(e) => {
                    login.setPassword(e.target.value);
                    login.setError(null);
                  }}
                  placeholder={t("passwordPlaceholder")}
                  className={cn(
                    "h-12 w-full rounded-xl border bg-white px-4 pr-12 text-[16px] transition-all duration-200 outline-none dark:bg-slate-900",
                    login.error
                      ? "border-red-300 text-red-900 placeholder:text-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
                      : "border-slate-200 placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 dark:border-slate-800",
                  )}
                  disabled={login.isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => login.setShowPassword(!login.showPassword)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                  tabIndex={-1}
                >
                  {login.showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {TURNSTILE_SITE_KEY &&
            !login.isPasswordMode &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login.email.trim()) && (
              <div className="mt-2">
                <TurnstileWidget onSuccess={login.setTurnstileToken} />
              </div>
            )}

          {login.error && (
            <p className="animate-in slide-in-from-top-1 fade-in ml-1 text-sm font-medium text-red-500">
              {login.error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              login.isLoading ||
              !login.email ||
              (login.isPasswordMode && !login.password)
            }
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:shadow-none dark:hover:bg-slate-200"
          >
            {login.isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {login.isPasswordMode ? t("signingIn") : t("sendingCode")}
              </>
            ) : login.isPasswordMode ? (
              t("login")
            ) : (
              t("sendEmailCode")
            )}
          </button>
        </form>
      </div>
    );
  }

  // ============ Email Code View ============
  if (login.view === "email-code") {
    const provider = login.getEmailProvider(login.email);

    return (
      <div className="animate-in slide-in-from-right-8 fade-in p-8 pt-6 duration-300">
        <button
          onClick={login.handleBackToEmail}
          className="mb-6 -ml-1 flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {tCommon("back")}
        </button>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600 ring-8 ring-green-50 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-900/10">
            <KeyRound className="h-8 w-8" />
          </div>

          <Title className="mb-3 text-2xl font-bold">
            {t("enterCodeTitle")}
          </Title>

          <Description className="text-muted-foreground mx-auto max-w-[300px] text-base">
            {t.rich("emailCodeSent", {
              email: login.email,
              bold: (chunks) => (
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {chunks}
                </span>
              ),
            })}
          </Description>
        </div>

        <form onSubmit={login.handleCodeFormSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="email-code"
              className="ml-1 text-xs font-medium tracking-wider text-slate-500 uppercase"
            >
              {t("codeLabel")}
            </label>
            <input
              id="email-code"
              type="text"
              value={login.emailCode}
              onChange={(e) => login.handleEmailCodeChange(e.target.value)}
              placeholder={t("codePlaceholder")}
              className={cn(
                "h-14 w-full rounded-xl border bg-white px-4 text-center text-2xl font-semibold tracking-[0.35em] transition-all duration-200 outline-none dark:bg-slate-900",
                login.error
                  ? "border-red-300 text-red-900 placeholder:text-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
                  : "border-slate-200 placeholder:text-slate-300 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 dark:border-slate-800",
              )}
              disabled={login.isLoading}
              autoFocus
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>

          {login.error && (
            <p className="animate-in slide-in-from-top-1 fade-in ml-1 text-sm font-medium text-red-500">
              {login.error}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isLoading || login.emailCode.length !== 6}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:shadow-none dark:hover:bg-slate-200"
          >
            {login.isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("verifyingCode")}
              </>
            ) : (
              t("verifyCode")
            )}
          </button>
        </form>

        <div className="mt-5 flex w-full flex-col gap-3">
          {provider && (
            <button
              onClick={() => window.open(provider.url, "_blank")}
              className="h-11 w-full rounded-xl bg-slate-100 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t("openProvider", { provider: provider.name })}
            </button>
          )}

          <button
            onClick={login.handleResendCode}
            disabled={login.isLoading}
            className="py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-50 dark:hover:text-slate-200"
          >
            {t("resendCode")}
          </button>

          <button
            onClick={login.handleUseDifferentEmail}
            className="py-1 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 dark:hover:text-slate-200"
          >
            {t("useDifferentEmail")}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
