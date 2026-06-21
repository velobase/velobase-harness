"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  BotMessageSquare,
  CheckCircle2,
  CreditCard,
  Image as ImageIcon,
  MessageSquare,
  Puzzle,
  Receipt,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentProviderTestPage } from "@/components/dashboard/payment-tests/payment-provider-test-page";
import { VelobaseGatewayTestPanel } from "@/components/dashboard/llm-tests/velobase-gateway-test-panel";
import { WavespeedTestPanel } from "@/components/dashboard/llm-tests/wavespeed-test-panel";

type ModuleCategory = "analytics" | "messaging" | "payment" | "llm";
type TestKey =
  | "payment:STRIPE"
  | "payment:LEMONSQUEEZY"
  | "llm:velobase-gateway"
  | "llm:wavespeed";

type ModuleConfigItem = {
  key: string;
  configured: boolean;
};

type ModuleStatusItem = {
  id: string;
  label: string;
  category: ModuleCategory;
  enabled: boolean;
  configured: boolean;
  implementationPresent: boolean;
  testKey: TestKey | null;
  config: ModuleConfigItem[];
  missingEnv: string[];
};

const CATEGORY_ORDER: ModuleCategory[] = [
  "analytics",
  "messaging",
  "payment",
  "llm",
];

const iconByCategory = {
  analytics: BarChart3,
  messaging: MessageSquare,
  payment: CreditCard,
  llm: BotMessageSquare,
} satisfies Record<ModuleCategory, typeof Puzzle>;

const iconByModule: Record<string, typeof Puzzle> = {
  stripe: CreditCard,
  lemonsqueezy: Receipt,
  nowpayments: CreditCard,
  "velobase-gateway": BotMessageSquare,
  wavespeed: ImageIcon,
};

export function IntegrationModuleStatusPanel() {
  const t = useTranslations("dashboard");
  const statusT = useTranslations("dashboard.moduleStatusPanel");
  const [selectedModule, setSelectedModule] = useState<ModuleStatusItem | null>(
    null,
  );

  const inventoryQuery =
    api.integrationDiagnostics.moduleStatusInventory.useQuery(undefined, {
      staleTime: 30_000,
    });

  const modules = (inventoryQuery.data?.modules ?? []) as ModuleStatusItem[];

  return (
    <div>
      <h2 className="text-muted-foreground mb-3 flex items-center gap-2 px-1 text-sm font-medium">
        <Puzzle className="h-4 w-4" />
        {t("moduleStatus")}
      </h2>
      <div className="border-border/50 bg-card/50 rounded-xl border p-5 backdrop-blur-sm">
        {inventoryQuery.error ? (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>{statusT("loadFailed")}</AlertTitle>
            <AlertDescription>{inventoryQuery.error.message}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-5">
            {CATEGORY_ORDER.map((category) => {
              const categoryModules = modules.filter(
                (module) => module.category === category,
              );
              if (!categoryModules.length && !inventoryQuery.isLoading) {
                return null;
              }

              return (
                <div key={category}>
                  <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                    {t(`categories.${category}`)}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {inventoryQuery.isLoading
                      ? Array.from({ length: 3 }).map((_, index) => (
                          <div
                            key={`${category}-${index}`}
                            className="bg-background/50 border-border/30 h-[82px] animate-pulse rounded-lg border"
                          />
                        ))
                      : categoryModules.map((module) => (
                          <ModuleStatusCard
                            key={module.id}
                            module={module}
                            onOpen={setSelectedModule}
                          />
                        ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-muted-foreground/60 mt-4 text-[11px]">
          {t("moduleStatusNote")}
        </p>
      </div>

      <Dialog
        open={Boolean(selectedModule)}
        onOpenChange={(open) => {
          if (!open) setSelectedModule(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
          {selectedModule ? (
            <>
              <DialogHeader>
                <DialogTitle>{selectedModule.label}</DialogTitle>
                <DialogDescription>
                  {selectedModule.testKey
                    ? statusT("dialogTestDescription")
                    : statusT("dialogInventoryDescription")}
                </DialogDescription>
              </DialogHeader>
              <ModuleDialogBody module={selectedModule} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleStatusCard({
  module,
  onOpen,
}: {
  module: ModuleStatusItem;
  onOpen: (module: ModuleStatusItem) => void;
}) {
  const statusT = useTranslations("dashboard.moduleStatusPanel");
  const ready = module.enabled && module.implementationPresent;
  const clickable = ready;
  const Icon = iconByModule[module.id] ?? iconByCategory[module.category];

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => onOpen(module)}
      className={cn(
        "bg-background/50 border-border/30 flex min-h-[82px] items-start gap-3 rounded-lg border px-3 py-3 text-left transition-all",
        clickable && "hover:bg-accent/50 hover:border-border hover:shadow-sm",
        !clickable && "cursor-not-allowed opacity-70",
        ready && "border-green-500/25 bg-green-500/5",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          ready
            ? "bg-green-500/10 text-green-600"
            : "bg-muted/50 text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          {ready ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
          ) : (
            <XCircle className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
          )}
          <span
            className={cn(
              "truncate text-sm font-medium",
              ready ? "text-foreground" : "text-muted-foreground/70",
            )}
          >
            {module.label}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant={ready ? "default" : "secondary"}>
            {getModuleBadge(module, statusT)}
          </Badge>
          {ready && module.testKey ? (
            <Badge variant="outline">{statusT("clickToTest")}</Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ModuleDialogBody({ module }: { module: ModuleStatusItem }) {
  const statusT = useTranslations("dashboard.moduleStatusPanel");

  if (module.testKey === "payment:STRIPE") {
    return <PaymentProviderTestPage provider="STRIPE" />;
  }

  if (module.testKey === "payment:LEMONSQUEEZY") {
    return <PaymentProviderTestPage provider="LEMONSQUEEZY" />;
  }

  if (module.testKey === "llm:velobase-gateway") {
    return <VelobaseGatewayTestPanel />;
  }

  if (module.testKey === "llm:wavespeed") {
    return <WavespeedTestPanel module={module} />;
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Puzzle className="h-4 w-4" />
        <AlertTitle>{statusT("inventoryOnlyTitle")}</AlertTitle>
        <AlertDescription>
          {statusT("inventoryOnlyDescription")}
        </AlertDescription>
      </Alert>
      <div className="grid gap-2 sm:grid-cols-2">
        {module.config.map((item) => (
          <div
            key={item.key}
            className="bg-background/50 border-border/30 flex items-center gap-2 rounded-lg border px-3 py-2"
          >
            {item.configured ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <XCircle className="text-muted-foreground/40 h-3.5 w-3.5" />
            )}
            <span className="text-muted-foreground truncate font-mono text-xs">
              {item.key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getModuleBadge(
  module: ModuleStatusItem,
  t: ReturnType<typeof useTranslations>,
) {
  if (!module.implementationPresent) {
    return t("implementationMissing");
  }

  if (!module.configured) {
    return t("notConfigured");
  }

  if (!module.enabled) {
    return t("notReady");
  }

  if (module.testKey) {
    return t("configured");
  }

  return t("configuredNoTest");
}
