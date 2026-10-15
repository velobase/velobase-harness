"use client";

import { useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  MessageSquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ErrorMessageProps {
  error: Error;
  onRetry?: () => void;
  onNewChat?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorMessage({
  error,
  onRetry,
  onNewChat,
  onDismiss,
  className,
}: ErrorMessageProps) {
  const t = useTranslations("aiChat");
  const [showDetails, setShowDetails] = useState(false);

  const getUserFriendlyMessage = (err: Error): string => {
    const message = err.message;
    if (message === "TOOL_OUTCOME_UNKNOWN") return t("errorToolUnknown");
    if (message === "REGENERATION_HAS_TOOLS")
      return t("errorRegenerationTools");
    if (message === "FEATURE_DISABLED") return t("errorFeatureDisabled");
    if (["AUTHORITY_REVOKED", "UNAUTHORIZED", "NOT_FOUND"].includes(message))
      return t("errorUnauthorized");
    if (message === "INVALID_ATTACHMENT") return t("errorAttachment");
    if (message === "HISTORY_LIMIT") return t("errorHistoryLimit");
    if (/^[A-Z_]+$/.test(message)) return t("errorDefault");

    if (
      message.includes("Failed to fetch") ||
      message.includes("NetworkError")
    ) {
      return t("errorNetwork");
    }
    if (message.includes("timeout") || message.includes("Timeout")) {
      return t("errorTimeout");
    }
    if (message.includes("Unauthorized") || message.includes("401")) {
      return t("errorUnauthorized");
    }
    if (message.includes("rate limit") || message.includes("429")) {
      return t("errorRateLimit");
    }
    if (message.includes("500") || message.includes("Internal Server Error")) {
      return t("errorServer");
    }
    if (
      message.includes("No tool schema found") ||
      message.includes("tool part")
    ) {
      return t("errorToolSchema");
    }
    if (message.includes("model") || message.includes("API key")) {
      return t("errorModel");
    }
    if (
      message.length < 100 &&
      !message.includes("{") &&
      !message.includes("Error:")
    ) {
      return message;
    }

    return t("errorDefault");
  };

  const friendlyMessage = getUserFriendlyMessage(error);
  const hasDetails = error.message !== friendlyMessage;

  return (
    <div
      className={cn(
        "my-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20",
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-900 dark:text-red-100">
            {friendlyMessage}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {onRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetry}
                className="h-8 border-red-300 text-xs text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                <RefreshCw className="mr-1.5 h-3 w-3" />
                {t("retry")}
              </Button>
            )}

            {onNewChat && (
              <Button
                size="sm"
                variant="outline"
                onClick={onNewChat}
                className="h-8 border-red-300 text-xs text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                <MessageSquarePlus className="mr-1.5 h-3 w-3" />
                {t("newChat")}
              </Button>
            )}

            {hasDetails && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDetails(!showDetails)}
                className="h-8 text-xs text-red-700 hover:bg-red-100 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                {showDetails ? (
                  <>
                    <ChevronUp className="mr-1.5 h-3 w-3" />
                    {t("hideDetails")}
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1.5 h-3 w-3" />
                    {t("showDetails")}
                  </>
                )}
              </Button>
            )}

            {onDismiss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="ml-auto h-8 w-8 p-0 text-red-700 hover:bg-red-100 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-900/50"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {showDetails && hasDetails && (
        <div className="border-t border-red-200 bg-red-100/50 p-4 dark:border-red-900/50 dark:bg-red-950/40">
          <p className="font-mono text-xs break-all text-red-800 dark:text-red-300">
            {error.message}
          </p>
        </div>
      )}
    </div>
  );
}
