"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { signIn } from "next-auth/react";
import { useAuthStore } from "./store/auth-store";
import { track } from "@/analytics";
import { AUTH_EVENTS } from "@/analytics/events/auth";
import { ensureDeviceKey } from "@/lib/device-key";
import { env } from "@/env";

// ============ Types ============
export type LoginView = "main" | "email" | "email-sent";

// ============ Constants ============
const PASSWORD_LOGIN_PREFIX = "testadmin";
const TEST_LOGIN_EMAIL = "testadmin@example.com";
const TEST_LOGIN_PASSWORD = "Testadmin2024!";

export const TEST_ACCOUNT_LOGIN_ENABLED =
  env.NEXT_PUBLIC_DISABLE_TEST_LOGIN === "false";

export const COMMON_EMAIL_DOMAINS = [
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "qq.com",
  "163.com",
  "126.com",
  "live.com",
  "me.com",
  "msn.com",
  "aol.com",
  "protonmail.com"
];

export const EMAIL_PROVIDERS: Record<string, { name: string; url: string }> = {
  "gmail.com": { name: "Gmail", url: "https://mail.google.com" },
  "googlemail.com": { name: "Gmail", url: "https://mail.google.com" },
  "outlook.com": { name: "Outlook", url: "https://outlook.live.com" },
  "hotmail.com": { name: "Outlook", url: "https://outlook.live.com" },
  "live.com": { name: "Outlook", url: "https://outlook.live.com" },
  "qq.com": { name: "QQ Mail", url: "https://mail.qq.com" },
  "163.com": { name: "163 Mail", url: "https://mail.163.com" },
  "126.com": { name: "126 Mail", url: "https://mail.126.com" },
  "yahoo.com": { name: "Yahoo Mail", url: "https://mail.yahoo.com" },
  "icloud.com": { name: "iCloud Mail", url: "https://www.icloud.com/mail" },
  "me.com": { name: "iCloud Mail", url: "https://www.icloud.com/mail" },
};

export const TURNSTILE_SITE_KEY: string | undefined =
  (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY as unknown as string | undefined) ?? undefined;

// ============ Helpers ============
export function normalizeEmailInput(raw: string): string {
  return raw
    .trim()
    .replaceAll("＠", "@")
    .replaceAll("。", ".")
    .replaceAll("．", ".")
    .replaceAll("｡", ".")
    .replaceAll("，", ",");
}

export function shouldUsePasswordLogin(emailInput: string): boolean {
  const input = emailInput.toLowerCase().trim();
  const localPart = input.split("@")[0] ?? "";
  return localPart === PASSWORD_LOGIN_PREFIX || input.startsWith(PASSWORD_LOGIN_PREFIX + "@");
}

export function getEmailProvider(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return EMAIL_PROVIDERS[domain] || null;
}

export function getEmailSuggestions(email: string): string[] {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return [];

  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1).toLowerCase();

  if (!domainPart) {
    return COMMON_EMAIL_DOMAINS.map(domain => `${localPart}@${domain}`);
  }

  return COMMON_EMAIL_DOMAINS
    .filter(domain => domain.startsWith(domainPart))
    .map(domain => `${localPart}@${domain}`);
}

// ============ Main Hook ============
export function useLogin() {
  const { loginModalOpen, callbackUrl, loginModalSource, setLoginModalOpen } = useAuthStore();
  const pathname = usePathname();
  const prevOpenRef = useRef(false);

  // ---- State ----
  const [view, setView] = useState<LoginView>("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Autocomplete
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const isSigninPage = pathname === "/auth/signin";
  const isPasswordMode = shouldUsePasswordLogin(email.toLowerCase().trim());
  const suggestions = getEmailSuggestions(email);

  // ---- Computed ----
  const getCallbackUrl = useCallback(() => {
    let computedCallbackUrl = "/";
    if (typeof window !== "undefined") {
      try {
        const search = new URLSearchParams(window?.location?.search ?? "");
        const nextParam = search.get("next");
        if (nextParam?.startsWith("/")) {
          computedCallbackUrl = nextParam;
        } else {
          const pathname = window?.location?.pathname ?? "/";
          const searchStr = window?.location?.search ?? "";
          const currentPathWithQuery = `${pathname}${searchStr}`;
          computedCallbackUrl = currentPathWithQuery.length > 0 ? currentPathWithQuery : "/";
        }
      } catch {
        computedCallbackUrl = "/";
      }
    }
    return callbackUrl ?? computedCallbackUrl;
  }, [callbackUrl]);

  // ---- Effects ----
  // Reset state when modal closes
  useEffect(() => {
    if (!loginModalOpen) {
      setView("main");
      setEmail("");
      setShowAutocomplete(false);
      setPassword("");
      setShowPassword(false);
      setError(null);
      setIsLoading(false);
    }
  }, [loginModalOpen]);

  // Track modal open
  useEffect(() => {
    if (loginModalOpen && !prevOpenRef.current) {
      const source = loginModalSource ?? "header";
      track(AUTH_EVENTS.LOGIN_MODAL_OPEN, { source });
    }
    prevOpenRef.current = loginModalOpen;
  }, [loginModalOpen, loginModalSource]);

  // Close autocomplete when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setShowAutocomplete(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---- Handlers ----
  const handleModalClose = (open: boolean) => {
    if (!open && loginModalOpen) {
      const atStep = view === "main" ? "main" : view === "email" ? "email_input" : "email_sent";
      track(AUTH_EVENTS.LOGIN_MODAL_CLOSE, { at_step: atStep });
    }
    setLoginModalOpen(open);
  };

  const handleOAuthLogin = (provider: string) => {
    ensureDeviceKey();
    track(AUTH_EVENTS.LOGIN_METHOD_SELECT, { method: provider });
    void signIn(provider, { callbackUrl: getCallbackUrl() });
  };

  const handleEmailMethodSelect = () => {
    track(AUTH_EVENTS.LOGIN_METHOD_SELECT, { method: "email" });
    setView("email");
    setTurnstileToken(null);
  };

  const handleBack = () => {
    setView("main");
    setError(null);
    setPassword("");
    setShowAutocomplete(false);
  };

  const handleEmailChange = (newVal: string) => {
    setEmail(newVal);
    setError(null);
    
    if (newVal.includes("@")) {
      setShowAutocomplete(true);
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }

    if (!shouldUsePasswordLogin(newVal.toLowerCase().trim())) {
      setPassword("");
    }
  };

  const handleEmailBlur = (value: string) => {
    const normalized = normalizeEmailInput(value);
    if (normalized !== value) {
      setEmail(normalized);
    }
  };

  const handleAutocompleteKeyDown = (e: React.KeyboardEvent) => {
    if (!showAutocomplete || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAutocompleteIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAutocompleteIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const selected = suggestions[autocompleteIndex];
      if (selected) setEmail(selected);
      setShowAutocomplete(false);
    } else if (e.key === "Escape") {
      setShowAutocomplete(false);
    }
  };

  const handleAutocompleteSuggestionClick = (suggestion: string) => {
    setEmail(suggestion);
    setShowAutocomplete(false);
  };

  const submitMagicLink = async () => {
    setError(null);
    setShowAutocomplete(false);

    const normalizedEmail = normalizeEmailInput(email).toLowerCase();
    if (normalizedEmail !== email) {
      setEmail(normalizedEmail);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    const emailDomain = normalizedEmail.split("@")[1] ?? "unknown";

    if (emailDomain === "gmail.com" || emailDomain === "googlemail.com") {
      setError("For Gmail accounts, please use 'Continue with Google' for a faster login experience.");
      track(AUTH_EVENTS.LOGIN_FAILED, { method: "email", reason: "gmail_use_google" });
      return;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the verification challenge.");
      return;
    }

    setIsLoading(true);
    track(AUTH_EVENTS.EMAIL_SUBMIT, { email_domain: emailDomain });

    try {
      ensureDeviceKey();

      const result = await signIn("nodemailer", {
        email: normalizedEmail,
        redirect: false,
        callbackUrl: getCallbackUrl(),
      });

      if (result?.error) {
        if (result.error.includes("DISPOSABLE_EMAIL")) {
          track(AUTH_EVENTS.LOGIN_FAILED, { method: "email", reason: "disposable_email" });
          setError("This email domain is not supported. Please use a permanent email (Gmail, Outlook, etc.).");
        } else {
          track(AUTH_EVENTS.LOGIN_FAILED, { method: "email", reason: "send_failed" });
          setError("Unable to send login email. Please try again later.");
        }
      } else {
        setView("email-sent");
      }
    } catch {
      track(AUTH_EVENTS.LOGIN_FAILED, { method: "email", reason: "unknown" });
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const submitPassword = async () => {
    setError(null);

    if (!password) {
      setError("Please enter your password");
      return;
    }

    setIsLoading(true);
    track(AUTH_EVENTS.LOGIN_METHOD_SELECT, { method: "credentials" });

    try {
      ensureDeviceKey();

      await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirectTo: getCallbackUrl(),
      });
    } catch (err) {
      if ((err as Error).message === "NEXT_REDIRECT") {
        return;
      }
      console.error(err);
      track(AUTH_EVENTS.LOGIN_FAILED, { method: "credentials", reason: "unknown" });
      setError("Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestAccountLogin = async () => {
    setError(null);
    setShowAutocomplete(false);
    setEmail(TEST_LOGIN_EMAIL);
    setPassword(TEST_LOGIN_PASSWORD);
    setIsLoading(true);
    track(AUTH_EVENTS.LOGIN_METHOD_SELECT, { method: "test_credentials" });

    try {
      ensureDeviceKey();

      await signIn("credentials", {
        email: TEST_LOGIN_EMAIL,
        password: TEST_LOGIN_PASSWORD,
        redirectTo: getCallbackUrl(),
      });
    } catch (err) {
      if ((err as Error).message === "NEXT_REDIRECT") {
        return;
      }
      console.error(err);
      track(AUTH_EVENTS.LOGIN_FAILED, { method: "test_credentials", reason: "unknown" });
      setError("Unable to sign in with the test account.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (showAutocomplete && suggestions.length > 0) {
      const selected = suggestions[autocompleteIndex];
      if (selected) setEmail(selected);
      setShowAutocomplete(false);
      return;
    }
    
    if (isPasswordMode) {
      await submitPassword();
    } else {
      await submitMagicLink();
    }
  };

  const handleUseDifferentEmail = () => {
    setView("email");
    setEmail("");
  };

  return {
    // Global state
    loginModalOpen,
    isSigninPage,
    
    // View state
    view,
    setView,
    
    // Form state
    email,
    password,
    showPassword,
    isLoading,
    error,
    turnstileToken,
    isPasswordMode,
    isTestAccountLoginEnabled: TEST_ACCOUNT_LOGIN_ENABLED,
    
    // Autocomplete
    showAutocomplete,
    autocompleteIndex,
    autocompleteRef,
    suggestions,
    
    // Setters
    setEmail,
    setPassword,
    setShowPassword,
    setTurnstileToken,
    setError,
    
    // Handlers
    handleModalClose,
    handleOAuthLogin,
    handleEmailMethodSelect,
    handleBack,
    handleEmailChange,
    handleEmailBlur,
    handleAutocompleteKeyDown,
    handleAutocompleteSuggestionClick,
    handleFormSubmit,
    handleUseDifferentEmail,
    handleTestAccountLogin,
    
    // Helpers
    getEmailProvider,
  };
}
