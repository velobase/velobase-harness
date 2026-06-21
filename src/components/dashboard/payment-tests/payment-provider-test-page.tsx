"use client";

import { useState, type ElementType } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Activity,
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  ListOrdered,
  Loader2,
  Receipt,
  RefreshCw,
  Repeat,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PaymentTestProvider = "STRIPE" | "LEMONSQUEEZY";

type TestResult = {
  action: string;
  status: "success" | "error" | "pending";
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
};

type TestAction = {
  id: string;
  label: string;
  description: string;
  icon: ElementType;
  handler: () => void | Promise<void>;
  category: string;
  disabled?: boolean;
};

export function PaymentProviderTestPage({
  provider,
}: {
  provider: PaymentTestProvider;
}) {
  const t = useTranslations("paymentTest");
  const { data: session } = useSession();
  const [results, setResults] = useState<TestResult[]>([]);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const inventoryQuery =
    api.integrationDiagnostics.paymentTestInventory.useQuery(undefined, {
      staleTime: 30_000,
    });
  const productsQuery = api.product.listAvailable.useQuery({ limit: 20 });
  const checkoutMutation = api.order.checkout.useMutation();
  const confirmPaymentMutation = api.order.confirmPayment.useMutation();
  const listOrdersQuery = api.order.listOrders.useQuery(
    { limit: 5 },
    { enabled: false },
  );
  const listPaymentsQuery = api.order.listPayments.useQuery(
    { limit: 5 },
    { enabled: false },
  );
  const balanceQuery = api.billing.getBalance.useQuery(
    { userId: session?.user.id ?? "" },
    { enabled: false },
  );
  const subscriptionQuery = api.membership.getSubscriptionStatus.useQuery(
    { userId: session?.user.id ?? "" },
    { enabled: false },
  );
  const hasSavedCardQuery = api.order.hasSavedCard.useQuery(undefined, {
    enabled: false,
  });

  const providerStatus = inventoryQuery.data?.providers.find(
    (item) => item.id === provider,
  );
  const providerLabel = provider === "STRIPE" ? t("stripe") : t("lemonsqueezy");
  const inventoryReady = Boolean(providerStatus);
  const implementationPresent = providerStatus?.implementationPresent === true;
  const providerConfigured = providerStatus?.configured === true;
  const canRunProviderActions = implementationPresent && providerConfigured;

  const addResult = (result: TestResult) => {
    setResults((prev) => [result, ...prev].slice(0, 20));
  };

  const runAction = async (
    actionName: string,
    fn: () => Promise<TestResult>,
  ) => {
    if (runningAction) return;
    setRunningAction(actionName);
    try {
      addResult(await fn());
    } catch (err) {
      addResult({
        action: actionName,
        status: "error",
        message: err instanceof Error ? err.message : t("unknownError"),
        timestamp: new Date(),
      });
    } finally {
      setRunningAction(null);
    }
  };

  const findTestProduct = (type: "CREDITS_PACKAGE" | "SUBSCRIPTION") => {
    const items = productsQuery.data?.products ?? [];
    return (
      items.find(
        (product) => product.type === type && (product.price ?? 0) > 0,
      ) ??
      items.find((product) => product.type === type) ??
      null
    );
  };

  const testOneTimeCheckout = () =>
    runAction(t("oneTimePayment"), async () => {
      const product = findTestProduct("CREDITS_PACKAGE");
      if (!product) {
        return {
          action: t("oneTimePayment"),
          status: "error",
          message: t("resultNoProduct", { type: "credits" }),
          timestamp: new Date(),
        };
      }

      const result = await checkoutMutation.mutateAsync({
        productId: product.id,
        gateway: provider,
        successUrl: `${window.location.origin}/payment/success`,
        cancelUrl: window.location.href,
        metadata: {
          source: "dashboard-payment-test",
          provider,
        },
      });

      if (result.status === "OK" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return {
          action: t("oneTimePayment"),
          status: "success",
          message: t("resultCheckoutOk"),
          data: {
            orderId: result.orderId,
            paymentId: result.paymentId,
            url: result.url,
          },
          timestamp: new Date(),
        };
      }

      return {
        action: t("oneTimePayment"),
        status: "error",
        message:
          result.status === "CONFLICT"
            ? t("resultConflict", {
                message: (result as { message?: string }).message ?? "",
              })
            : t("resultNoUrl"),
        timestamp: new Date(),
      };
    });

  const testSubscriptionCheckout = () =>
    runAction(t("subscriptionPayment"), async () => {
      const product = findTestProduct("SUBSCRIPTION");
      if (!product) {
        return {
          action: t("subscriptionPayment"),
          status: "error",
          message: t("resultNoProduct", { type: "subscription" }),
          timestamp: new Date(),
        };
      }

      const result = await checkoutMutation.mutateAsync({
        productId: product.id,
        gateway: provider,
        successUrl: `${window.location.origin}/payment/success`,
        cancelUrl: window.location.href,
        metadata: {
          source: "dashboard-payment-test",
          provider,
        },
      });

      if (result.status === "OK" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return {
          action: t("subscriptionPayment"),
          status: "success",
          message: t("resultCheckoutOk"),
          data: {
            orderId: result.orderId,
            paymentId: result.paymentId,
            url: result.url,
          },
          timestamp: new Date(),
        };
      }

      return {
        action: t("subscriptionPayment"),
        status: "error",
        message:
          result.status === "CONFLICT"
            ? t("resultConflict", {
                message: (result as { message?: string }).message ?? "",
              })
            : t("resultNoUrl"),
        timestamp: new Date(),
      };
    });

  const testConfirmPayment = () =>
    runAction(t("confirmPayment"), async () => {
      const fetched = await listPaymentsQuery.refetch();
      const payments = fetched.data?.payments ?? [];
      const pendingPayment = payments.find(
        (payment) =>
          payment.status === "PENDING" && payment.paymentGateway === provider,
      );

      if (!pendingPayment) {
        return {
          action: t("confirmPayment"),
          status: "error",
          message: t("resultNoPending"),
          timestamp: new Date(),
        };
      }

      const result = await confirmPaymentMutation.mutateAsync({
        paymentId: pendingPayment.id,
      });
      return {
        action: t("confirmPayment"),
        status: result.status === "SUCCEEDED" ? "success" : "pending",
        message: t("resultPaymentStatus", { status: result.status }),
        data: {
          paymentId: result.paymentId,
          orderId: result.orderId,
          status: result.status,
        },
        timestamp: new Date(),
      };
    });

  const testListOrders = () =>
    runAction(t("listOrders"), async () => {
      const result = await listOrdersQuery.refetch();
      const orders = result.data?.orders ?? [];
      return {
        action: t("listOrders"),
        status: "success",
        message: t("resultOrderCount", { count: orders.length }),
        data: {
          count: orders.length,
          latest: orders[0]
            ? {
                id: orders[0].id,
                status: orders[0].status,
                amount: orders[0].amount,
              }
            : null,
        },
        timestamp: new Date(),
      };
    });

  const testListPayments = () =>
    runAction(t("listPayments"), async () => {
      const result = await listPaymentsQuery.refetch();
      const payments = result.data?.payments ?? [];
      return {
        action: t("listPayments"),
        status: "success",
        message: t("resultPaymentCount", { count: payments.length }),
        data: {
          count: payments.length,
          latest: payments[0]
            ? {
                id: payments[0].id,
                status: payments[0].status,
                gateway: payments[0].paymentGateway,
                amount: payments[0].amount,
              }
            : null,
        },
        timestamp: new Date(),
      };
    });

  const testGetBalance = () =>
    runAction(t("balance"), async () => {
      const result = await balanceQuery.refetch();
      const data = result.data;
      const available = data?.totalSummary.available ?? 0;
      return {
        action: t("balance"),
        status: "success",
        message: t("resultBalance", { available }),
        data: {
          available,
          total: data?.totalSummary.total ?? 0,
          frozen: data?.totalSummary.frozen ?? 0,
        },
        timestamp: new Date(),
      };
    });

  const testSubscriptionStatus = () =>
    runAction(t("subStatus"), async () => {
      const result = await subscriptionQuery.refetch();
      const data = result.data;
      return {
        action: t("subStatus"),
        status: "success",
        message: t("resultSubStatus", { status: data?.status ?? "NONE" }),
        data: {
          status: data?.status,
          planType: (data as unknown as Record<string, unknown>)?.planType,
          subscriptionId: (data as unknown as Record<string, unknown>)
            ?.subscriptionId,
        },
        timestamp: new Date(),
      };
    });

  const testHasSavedCard = () =>
    runAction(t("savedCard"), async () => {
      const result = await hasSavedCardQuery.refetch();
      const card = result.data;
      return {
        action: t("savedCard"),
        status: "success",
        message: card ? t("resultHasCard") : t("resultNoCard"),
        data: { hasSavedCard: Boolean(card), card },
        timestamp: new Date(),
      };
    });

  const actions: TestAction[] = [
    {
      id: "one-time",
      label: t("oneTimePayment"),
      description: t("oneTimePaymentDesc"),
      icon: ShoppingCart,
      handler: testOneTimeCheckout,
      category: t("catCheckout"),
      disabled: !canRunProviderActions,
    },
    {
      id: "subscription",
      label: t("subscriptionPayment"),
      description: t("subscriptionPaymentDesc"),
      icon: Repeat,
      handler: testSubscriptionCheckout,
      category: t("catCheckout"),
      disabled: !canRunProviderActions,
    },
    {
      id: "confirm",
      label: t("confirmPayment"),
      description: t("confirmPaymentDesc"),
      icon: RefreshCw,
      handler: testConfirmPayment,
      category: t("catPaymentOps"),
      disabled: !canRunProviderActions,
    },
    ...(provider === "STRIPE"
      ? [
          {
            id: "saved-card",
            label: t("savedCard"),
            description: t("savedCardDesc"),
            icon: CreditCard,
            handler: testHasSavedCard,
            category: t("catStripe"),
            disabled: !implementationPresent,
          },
        ]
      : []),
    {
      id: "list-orders",
      label: t("listOrders"),
      description: t("listOrdersDesc"),
      icon: ListOrdered,
      handler: testListOrders,
      category: t("catQuery"),
    },
    {
      id: "list-payments",
      label: t("listPayments"),
      description: t("listPaymentsDesc"),
      icon: FileText,
      handler: testListPayments,
      category: t("catQuery"),
    },
    {
      id: "balance",
      label: t("balance"),
      description: t("balanceDesc"),
      icon: Banknote,
      handler: testGetBalance,
      category: t("catQuery"),
    },
    {
      id: "sub-status",
      label: t("subStatus"),
      description: t("subStatusDesc"),
      icon: Activity,
      handler: testSubscriptionStatus,
      category: t("catQuery"),
    },
  ];

  const categories = [...new Set(actions.map((action) => action.category))];

  return (
    <div className="space-y-5">
      <div className="border-border/50 bg-card/50 rounded-xl border p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  inventoryReady && providerConfigured ? "default" : "secondary"
                }
              >
                {!inventoryReady
                  ? t("checking")
                  : providerConfigured
                    ? t("configured")
                    : t("notConfigured")}
              </Badge>
              <Badge
                variant={
                  inventoryReady && implementationPresent
                    ? "outline"
                    : "secondary"
                }
              >
                {!inventoryReady
                  ? t("checking")
                  : implementationPresent
                    ? t("implementationPresent")
                    : t("implementationMissing")}
              </Badge>
            </div>
            <p className="text-muted-foreground max-w-2xl text-sm">
              {provider === "LEMONSQUEEZY"
                ? t("lemonsqueezyTestDesc")
                : t("stripeTestDesc")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inventoryQuery.refetch()}
            disabled={inventoryQuery.isFetching}
          >
            {inventoryQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t("refresh")}
          </Button>
        </div>

        {inventoryReady && !implementationPresent ? (
          <Alert className="mt-4" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("implementationMissing")}</AlertTitle>
            <AlertDescription>
              {t("lemonsqueezyConfigRequired")}
            </AlertDescription>
          </Alert>
        ) : null}

        {providerStatus?.missingEnv.length ? (
          <div className="mt-4">
            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              {t("missingConfig")}
            </div>
            <div className="flex flex-wrap gap-2">
              {providerStatus.missingEnv.map((key) => (
                <Badge key={key} variant="secondary" className="font-mono">
                  {key}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="space-y-5">
          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <h2 className="text-muted-foreground px-1 text-xs font-medium uppercase">
                {category}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {actions
                  .filter((action) => action.category === category)
                  .map((action) => {
                    const isRunning = runningAction === action.label;
                    const disabled =
                      Boolean(runningAction) || Boolean(action.disabled);

                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => void action.handler()}
                        disabled={disabled}
                        className={cn(
                          "border-border/50 bg-card/50 flex min-h-[86px] items-start gap-3 rounded-lg border p-3 text-left transition-all",
                          "hover:bg-accent/50 hover:border-border active:scale-[0.98]",
                          disabled && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <div className="bg-muted/50 text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                          {isRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <action.icon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-foreground text-sm font-medium">
                            {action.label}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                            {action.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-border/50 bg-card/50 rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Receipt className="text-primary h-4 w-4" />
              {t("results")}
            </div>
            {results.length ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setResults([])}
              >
                {t("clear")}
              </Button>
            ) : null}
          </div>

          {!results.length ? (
            <div className="text-muted-foreground flex min-h-[220px] items-center justify-center text-center text-sm">
              {t("noResults", { provider: providerLabel })}
            </div>
          ) : (
            <div className="max-h-[620px] space-y-2 overflow-y-auto">
              {results.map((result, index) => (
                <ResultCard key={`${result.action}-${index}`} result={result} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: TestResult }) {
  const t = useTranslations("paymentTest");

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        result.status === "success" && "border-green-500/20 bg-green-500/5",
        result.status === "error" && "border-red-500/20 bg-red-500/5",
        result.status === "pending" && "border-yellow-500/20 bg-yellow-500/5",
      )}
    >
      <div className="flex items-start gap-2">
        {result.status === "success" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        ) : result.status === "error" ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        ) : (
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground font-medium">{result.action}</span>
            <span className="text-muted-foreground text-[10px]">
              {result.timestamp.toLocaleTimeString()}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {result.message}
          </p>
          {result.data ? (
            <details className="mt-1">
              <summary className="text-muted-foreground/70 hover:text-muted-foreground cursor-pointer text-[11px]">
                {t("expandDetails")}
              </summary>
              <pre className="bg-muted/30 text-muted-foreground mt-1 overflow-x-auto rounded p-2 text-[10px] break-all whitespace-pre-wrap">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </details>
          ) : null}
          {typeof result.data?.url === "string" ? (
            <a
              href={result.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary mt-1.5 inline-flex items-center gap-1 text-xs hover:underline"
            >
              {t("openCheckout")}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
