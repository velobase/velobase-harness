"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const TERMINAL_TASK_STATUSES = new Set([
  "succeeded",
  "failed",
  "canceled",
  "timed_out",
]);

type ModuleStatusFallback = {
  enabled: boolean;
  configured: boolean;
  config: Array<{
    key: string;
    configured: boolean;
  }>;
};

export function WavespeedTestPanel({
  module,
}: {
  module?: ModuleStatusFallback;
}) {
  const t = useTranslations("dashboard.wavespeed");
  const [prompt, setPrompt] = useState(t("defaultPrompt"));
  const [model, setModel] = useState("wavespeed-ai/flux-dev");
  const [taskId, setTaskId] = useState<string | null>(null);

  const statusQuery = api.integrationDiagnostics.wavespeedStatus.useQuery(
    undefined,
    {
      staleTime: 30_000,
    },
  );

  const connectionMutation =
    api.integrationDiagnostics.testWavespeedConnection.useMutation();

  const generationMutation =
    api.integrationDiagnostics.runWavespeedImageTest.useMutation({
      onSuccess: (task) => {
        setTaskId(task.id);
      },
    });

  const taskQuery = api.integrationDiagnostics.imageGenerationTask.useQuery(
    { taskId: taskId ?? "" },
    {
      enabled: Boolean(taskId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status && TERMINAL_TASK_STATUSES.has(status) ? false : 3000;
      },
    },
  );

  const missingConnectionConfig = useMemo(
    () =>
      (statusQuery.data?.connectionConfig ?? module?.config ?? []).filter(
        (item) => !item.configured,
      ),
    [module?.config, statusQuery.data?.connectionConfig],
  );
  const missingGenerationConfig = useMemo(
    () =>
      statusQuery.data?.generationConfig.filter((item) => !item.configured) ??
      [],
    [statusQuery.data?.generationConfig],
  );

  const generatedAsset = taskQuery.data?.assets.find(
    (asset) => asset.status === "succeeded",
  );
  const generatedImageUrl =
    generatedAsset?.publicUrl ?? generatedAsset?.sourceUrl;
  const moduleEnabled = statusQuery.data?.moduleEnabled ?? module?.enabled;
  const connectionConfig =
    statusQuery.data?.connectionConfig ?? module?.config ?? [];
  const connectionConfigReady =
    statusQuery.data?.connectionConfigReady ??
    connectionConfig.every((item) => item.configured);
  const generationConfig = statusQuery.data?.generationConfig ?? [];
  const generationConfigKnown = Boolean(statusQuery.data);
  const generationConfigReady =
    statusQuery.data?.generationConfigReady ?? false;
  const optionalConfig = statusQuery.data?.optionalConfig ?? [];
  const canRun =
    generationConfigReady &&
    prompt.trim().length > 0 &&
    model.trim().length > 0;

  return (
    <div>
      <h2 className="text-muted-foreground mb-3 flex items-center gap-2 px-1 text-sm font-medium">
        <Zap className="h-4 w-4" />
        {t("title")}
      </h2>

      <div className="border-border/50 bg-card/50 rounded-xl border p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={moduleEnabled ? "default" : "secondary"}>
                {moduleEnabled ? t("moduleEnabled") : t("moduleDisabled")}
              </Badge>
              <Badge variant={connectionConfigReady ? "outline" : "secondary"}>
                {connectionConfigReady
                  ? t("connectionConfigReady")
                  : t("connectionConfigMissing", {
                      count: missingConnectionConfig.length,
                    })}
              </Badge>
              <Badge
                variant={
                  generationConfigKnown && generationConfigReady
                    ? "outline"
                    : "secondary"
                }
              >
                {!generationConfigKnown
                  ? t("checking")
                  : generationConfigReady
                    ? t("generationConfigReady")
                    : t("generationConfigMissing", {
                        count: missingGenerationConfig.length,
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
              (statusQuery.isLoading && !module) ||
              !connectionConfigReady
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
                items={connectionConfig}
              />
              <ConfigGroup
                title={t("generationConfig")}
                items={generationConfig}
              />
            </div>
            {optionalConfig.length ? (
              <ConfigGroup title={t("optionalConfig")} items={optionalConfig} />
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
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
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
                    {t("aspectRatio")}
                  </span>
                  <Input value="1:1" readOnly />
                </label>
              </div>

              <label className="space-y-1.5">
                <span className="text-muted-foreground text-xs font-medium">
                  {t("prompt")}
                </span>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  className="min-h-24 resize-none"
                />
              </label>

              <Button
                type="button"
                onClick={() =>
                  generationMutation.mutate({
                    prompt,
                    model,
                    aspectRatio: "1:1",
                    quality: "medium",
                    resolution: "1k",
                    outputFormat: "png",
                  })
                }
                disabled={!canRun || generationMutation.isPending}
              >
                {generationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {t("runGeneration")}
              </Button>

              {generationMutation.error ? (
                <StatusAlert
                  variant="destructive"
                  title={t("generationFailed")}
                  message={generationMutation.error.message}
                />
              ) : null}

              {!canRun ? (
                <p className="text-muted-foreground text-xs">
                  {t("generationDisabledHint")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-border/50 bg-background/40 min-h-[240px] rounded-lg border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="text-primary h-4 w-4" />
                {t("latestTask")}
              </div>
              {taskQuery.data ? (
                <TaskStatusBadge status={taskQuery.data.status} />
              ) : null}
            </div>

            {!taskId ? (
              <div className="text-muted-foreground flex h-[180px] items-center justify-center text-center text-sm">
                {t("noTask")}
              </div>
            ) : null}

            {taskId && taskQuery.isLoading ? (
              <div className="text-muted-foreground flex h-[180px] items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("loadingTask")}
              </div>
            ) : null}

            {taskQuery.error ? (
              <StatusAlert
                variant="destructive"
                title={t("taskLoadFailed")}
                message={taskQuery.error.message}
              />
            ) : null}

            {taskQuery.data ? (
              <div className="space-y-3">
                <div className="text-muted-foreground space-y-1 text-xs">
                  <div>
                    {t("taskId")}:{" "}
                    <span className="text-foreground font-mono">
                      {taskQuery.data.id}
                    </span>
                  </div>
                  {taskQuery.data.errorMessage ? (
                    <div className="text-destructive">
                      {taskQuery.data.errorMessage}
                    </div>
                  ) : null}
                </div>

                {generatedImageUrl ? (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={generatedImageUrl}
                      alt={t("generatedAlt")}
                      className="aspect-square w-full rounded-md object-cover"
                    />
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={generatedImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {t("openImage")}
                      </a>
                    </Button>
                  </div>
                ) : (
                  <div className="bg-muted/30 text-muted-foreground flex min-h-[120px] items-center justify-center gap-2 rounded-md text-sm">
                    <Clock className="h-4 w-4" />
                    {t("waitingForWorker")}
                  </div>
                )}
              </div>
            ) : null}
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

function TaskStatusBadge({ status }: { status: string }) {
  const t = useTranslations("dashboard.wavespeed.taskStatus");
  const isSuccess = status === "succeeded";
  const isTerminal = TERMINAL_TASK_STATUSES.has(status);

  return (
    <Badge
      variant={isSuccess ? "default" : isTerminal ? "secondary" : "outline"}
    >
      {status === "queued"
        ? t("queued")
        : status === "running"
          ? t("running")
          : status === "succeeded"
            ? t("succeeded")
            : status === "failed"
              ? t("failed")
              : status === "canceled"
                ? t("canceled")
                : status === "timed_out"
                  ? t("timed_out")
                  : status}
    </Badge>
  );
}
