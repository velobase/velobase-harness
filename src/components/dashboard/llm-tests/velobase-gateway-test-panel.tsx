"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  BotMessageSquare,
  CheckCircle2,
  Loader2,
  RefreshCw,
  SendHorizontal,
  XCircle,
} from "lucide-react";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function VelobaseGatewayTestPanel() {
  const t = useTranslations("dashboard.velobaseGateway");
  const [model, setModel] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [prompt, setPrompt] = useState(t("defaultPrompt"));
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const statusQuery = api.integrationDiagnostics.velobaseGatewayStatus.useQuery(
    undefined,
    {
      staleTime: 30_000,
    },
  );

  const connectionMutation =
    api.integrationDiagnostics.testVelobaseGatewayConnection.useMutation();

  const chatMutation =
    api.integrationDiagnostics.runVelobaseGatewayChatTest.useMutation();

  useEffect(() => {
    if (!statusQuery.data || defaultsApplied) return;

    setModel(statusQuery.data.defaultModel);
    setCustomerId(statusQuery.data.defaultTestCustomerId ?? "");
    setDefaultsApplied(true);
  }, [defaultsApplied, statusQuery.data]);

  const missingConnectionConfig = useMemo(
    () =>
      statusQuery.data?.connectionConfig.filter((item) => !item.configured) ??
      [],
    [statusQuery.data?.connectionConfig],
  );
  const missingSmokeConfig = useMemo(
    () =>
      statusQuery.data?.smokeConfig.filter((item) => !item.configured) ?? [],
    [statusQuery.data?.smokeConfig],
  );
  const requiresCustomerHeader =
    statusQuery.data?.requiresCustomerHeader ?? true;
  const canRunChat =
    statusQuery.data?.connectionConfigReady === true &&
    model.trim().length > 0 &&
    prompt.trim().length > 0 &&
    (!requiresCustomerHeader || customerId.trim().length > 0);

  return (
    <div>
      <h2 className="text-muted-foreground mb-3 flex items-center gap-2 px-1 text-sm font-medium">
        <BotMessageSquare className="h-4 w-4" />
        {t("title")}
      </h2>

      <div className="border-border/50 bg-card/50 rounded-xl border p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  statusQuery.data?.moduleEnabled ? "default" : "secondary"
                }
              >
                {statusQuery.data?.moduleEnabled
                  ? t("moduleEnabled")
                  : t("moduleDisabled")}
              </Badge>
              <Badge
                variant={
                  statusQuery.data?.connectionConfigReady
                    ? "outline"
                    : "secondary"
                }
              >
                {statusQuery.data?.connectionConfigReady
                  ? t("connectionConfigReady")
                  : t("connectionConfigMissing", {
                      count: missingConnectionConfig.length,
                    })}
              </Badge>
              <Badge
                variant={
                  statusQuery.data?.smokeConfigReady ? "outline" : "secondary"
                }
              >
                {statusQuery.data?.smokeConfigReady
                  ? t("smokeConfigReady")
                  : t("smokeConfigMissing", {
                      count: missingSmokeConfig.length,
                    })}
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm">
              {t("description")}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => connectionMutation.mutate()}
            disabled={
              connectionMutation.isPending ||
              statusQuery.isLoading ||
              !statusQuery.data?.connectionConfigReady
            }
          >
            {connectionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("checkConnection")}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <ConfigGroup
                title={t("connectionConfig")}
                items={statusQuery.data?.connectionConfig ?? []}
              />
              <ConfigGroup
                title={t("smokeConfig")}
                items={statusQuery.data?.smokeConfig ?? []}
              />
            </div>

            {statusQuery.data?.optionalConfig.length ? (
              <ConfigGroup
                title={t("optionalConfig")}
                items={statusQuery.data.optionalConfig}
              />
            ) : null}

            {statusQuery.error ? (
              <StatusAlert
                variant="destructive"
                title={t("statusLoadFailed")}
                message={statusQuery.error.message}
              />
            ) : null}

            {connectionMutation.error ? (
              <StatusAlert
                variant="destructive"
                title={t("connectionFailed")}
                message={connectionMutation.error.message}
              />
            ) : null}

            {connectionMutation.data ? (
              <StatusAlert
                title={t("connectionSucceeded")}
                message={t("connectionSummary", {
                  count: connectionMutation.data.modelCount,
                })}
              />
            ) : null}

            {connectionMutation.data?.sampleModels.length ? (
              <div className="space-y-2">
                <div className="text-muted-foreground text-xs font-medium uppercase">
                  {t("sampleModels")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {connectionMutation.data.sampleModels.map((sample) => (
                    <Badge key={sample.id} variant="outline">
                      {sample.id}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-border/50 space-y-3 border-t pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-muted-foreground text-xs font-medium">
                    {t("model")}
                  </span>
                  <Input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-muted-foreground text-xs font-medium">
                    {t("customerId")}
                  </span>
                  <Input
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    placeholder={
                      requiresCustomerHeader
                        ? t("customerRequired")
                        : t("customerOptional")
                    }
                  />
                </label>
              </div>

              <label className="space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  {t("prompt")}
                </span>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-20 resize-none"
                />
              </label>

              <Button
                type="button"
                onClick={() =>
                  chatMutation.mutate({
                    customerId: customerId.trim() || undefined,
                    model: model.trim() || undefined,
                    prompt,
                    maxTokens: 64,
                  })
                }
                disabled={!canRunChat || chatMutation.isPending}
              >
                {chatMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
                {t("runChat")}
              </Button>

              {chatMutation.error ? (
                <StatusAlert
                  variant="destructive"
                  title={t("chatFailed")}
                  message={chatMutation.error.message}
                />
              ) : null}

              {!canRunChat ? (
                <p className="text-muted-foreground text-xs">
                  {t("chatDisabledHint")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-border/50 bg-background/40 min-h-[260px] rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BotMessageSquare className="text-primary h-4 w-4" />
                {t("latestResult")}
              </div>
              {chatMutation.data ? (
                <Badge variant="default">{t("ok")}</Badge>
              ) : null}
            </div>

            {!chatMutation.data ? (
              <div className="text-muted-foreground flex h-[180px] items-center justify-center text-center text-sm">
                {t("noResult")}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-muted/30 text-foreground rounded-md p-3 text-sm">
                  {chatMutation.data.message || t("emptyMessage")}
                </div>

                <DetailList
                  title={t("usage")}
                  rows={[
                    [t("promptTokens"), chatMutation.data.usage.promptTokens],
                    [
                      t("completionTokens"),
                      chatMutation.data.usage.completionTokens,
                    ],
                    [t("totalTokens"), chatMutation.data.usage.totalTokens],
                  ]}
                />

                <DetailList
                  title={t("billingHeaders")}
                  rows={[
                    [t("costCents"), chatMutation.data.billing.costCents],
                    [t("costCredits"), chatMutation.data.billing.costCredits],
                    [
                      t("balanceCredits"),
                      chatMutation.data.billing.balanceCredits,
                    ],
                    [
                      t("transactionId"),
                      chatMutation.data.billing.transactionId,
                    ],
                  ]}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; configured: boolean }>;
}) {
  return (
    <div className="bg-background/40 space-y-2 rounded-lg p-3">
      <div className="text-muted-foreground text-xs font-medium uppercase">
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-xs">
            {item.configured ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <XCircle className="text-muted-foreground/50 h-3.5 w-3.5" />
            )}
            <span
              className={cn(
                "font-mono",
                item.configured ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {item.key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusAlert({
  title,
  message,
  variant,
}: {
  title: string;
  message: string;
  variant?: "default" | "destructive";
}) {
  return (
    <Alert variant={variant}>
      {variant === "destructive" ? (
        <AlertCircle className="h-4 w-4" />
      ) : (
        <CheckCircle2 className="h-4 w-4" />
      )}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function DetailList({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string | number | undefined]>;
}) {
  const t = useTranslations("dashboard.velobaseGateway");

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium uppercase">
        {title}
      </div>
      <div className="space-y-1.5 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground max-w-[180px] text-right font-mono break-all">
              {value ?? t("notAvailable")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
