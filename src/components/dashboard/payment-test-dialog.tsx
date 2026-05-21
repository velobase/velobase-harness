"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  Receipt,
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShoppingCart,
  Repeat,
  ListOrdered,
  Banknote,
  FileText,
  Activity,
  ChevronRight,
  Ban,
} from "lucide-react";

type Gateway = "STRIPE" | "NOWPAYMENTS" | "LEMONSQUEEZY";

interface PaymentTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "select-provider" | "test-actions";

interface TestResult {
  action: string;
  status: "success" | "error" | "pending";
  message: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

export function PaymentTestDialog({ open, onOpenChange }: PaymentTestDialogProps) {
  const t = useTranslations("paymentTest");

  const [step, setStep] = React.useState<Step>("select-provider");
  const [selectedGateway, setSelectedGateway] = React.useState<Gateway | null>(null);
  const [results, setResults] = React.useState<TestResult[]>([]);
  const [runningAction, setRunningAction] = React.useState<string | null>(null);

  const gatewaysQuery = api.order.getAvailableGateways.useQuery(undefined, { enabled: open });

  const gateways: {
    id: Gateway;
    labelKey: "stripe" | "nowpayments" | "lemonsqueezy";
    descKey: "stripeDesc" | "nowpaymentsDesc" | "lemonsqueezyDesc";
    icon: React.ElementType;
    featureKeys: string[];
  }[] = [
    {
      id: "STRIPE",
      labelKey: "stripe",
      descKey: "stripeDesc",
      icon: CreditCard,
      featureKeys: ["featureOneTime", "featureSubscription", "featureWebhook", "featureRefund", "featureCustomer"],
    },
    {
      id: "NOWPAYMENTS",
      labelKey: "nowpayments",
      descKey: "nowpaymentsDesc",
      icon: Wallet,
      featureKeys: ["featureOneTime", "featureIPN", "featureCurrencies", "featureEstimate"],
    },
    {
      id: "LEMONSQUEEZY",
      labelKey: "lemonsqueezy",
      descKey: "lemonsqueezyDesc",
      icon: Receipt,
      featureKeys: ["featureOneTime", "featureSubscription", "featureWebhook", "featureTax"],
    },
  ];

  const productsQuery = api.product.listAvailable.useQuery(
    { limit: 20 },
    { enabled: open },
  );

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
    { userId: "__self__" },
    { enabled: false },
  );
  const subscriptionQuery = api.membership.getSubscriptionStatus.useQuery(
    { userId: "__self__" },
    { enabled: false },
  );
  const hasSavedCardQuery = api.order.hasSavedCard.useQuery(
    undefined,
    { enabled: false },
  );
  const cryptoCurrenciesQuery = api.order.getCryptoCurrencies.useQuery(
    undefined,
    { enabled: false },
  );

  React.useEffect(() => {
    if (!open) {
      setStep("select-provider");
      setSelectedGateway(null);
      setResults([]);
      setRunningAction(null);
    }
  }, [open]);

  const addResult = (result: TestResult) => {
    setResults((prev) => [result, ...prev]);
  };

  const isGatewayAvailable = (id: Gateway): boolean => {
    if (!gatewaysQuery.data) return false;
    return gatewaysQuery.data[id] === true;
  };

  const selectProvider = (gateway: Gateway) => {
    if (!isGatewayAvailable(gateway)) return;
    setSelectedGateway(gateway);
    setStep("test-actions");
    setResults([]);
  };

  const goBack = () => {
    setStep("select-provider");
    setSelectedGateway(null);
    setResults([]);
  };

  // ── Test actions ──

  const findTestProduct = (type: "CREDITS_PACKAGE" | "SUBSCRIPTION") => {
    const items = productsQuery.data?.products ?? [];
    return (
      items.find((p: { type: string; price?: number | null }) => p.type === type && (p.price ?? 0) > 0) ??
      items.find((p: { type: string }) => p.type === type) ??
      items[0] ??
      null
    );
  };

  const runAction = async (actionName: string, fn: () => Promise<TestResult>) => {
    if (runningAction) return;
    setRunningAction(actionName);
    try {
      const result = await fn();
      addResult(result);
    } catch (err) {
      addResult({
        action: actionName,
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date(),
      });
    } finally {
      setRunningAction(null);
    }
  };

  const testOneTimeCheckout = () =>
    runAction(t("oneTimePayment"), async () => {
      const product = findTestProduct("CREDITS_PACKAGE");
      if (!product) return { action: t("oneTimePayment"), status: "error" as const, message: t("resultNoProduct", { type: "credits" }), timestamp: new Date() };

      const result = await checkoutMutation.mutateAsync({
        productId: product.id,
        gateway: selectedGateway!,
        successUrl: `${window.location.origin}/payment/success`,
        cancelUrl: window.location.href,
      });

      if (result.status === "OK" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return {
          action: t("oneTimePayment"),
          status: "success" as const,
          message: t("resultCheckoutOk"),
          data: { orderId: result.orderId, paymentId: result.paymentId, url: result.url },
          timestamp: new Date(),
        };
      }
      if (result.status === "CONFLICT") {
        return { action: t("oneTimePayment"), status: "error" as const, message: t("resultConflict", { message: (result as { message?: string }).message ?? "" }), timestamp: new Date() };
      }
      return { action: t("oneTimePayment"), status: "error" as const, message: t("resultNoUrl"), timestamp: new Date() };
    });

  const testSubscriptionCheckout = () =>
    runAction(t("subscriptionPayment"), async () => {
      const product = findTestProduct("SUBSCRIPTION");
      if (!product) return { action: t("subscriptionPayment"), status: "error" as const, message: t("resultNoProduct", { type: "subscription" }), timestamp: new Date() };

      const result = await checkoutMutation.mutateAsync({
        productId: product.id,
        gateway: selectedGateway!,
        successUrl: `${window.location.origin}/payment/success`,
        cancelUrl: window.location.href,
      });

      if (result.status === "OK" && result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        return {
          action: t("subscriptionPayment"),
          status: "success" as const,
          message: t("resultCheckoutOk"),
          data: { orderId: result.orderId, paymentId: result.paymentId, url: result.url },
          timestamp: new Date(),
        };
      }
      if (result.status === "CONFLICT") {
        return { action: t("subscriptionPayment"), status: "error" as const, message: t("resultConflict", { message: (result as { message?: string }).message ?? "" }), timestamp: new Date() };
      }
      return { action: t("subscriptionPayment"), status: "error" as const, message: t("resultNoUrl"), timestamp: new Date() };
    });

  const testConfirmPayment = () =>
    runAction(t("confirmPayment"), async () => {
      const fetched = await listPaymentsQuery.refetch();
      const payments = fetched.data?.payments ?? [];
      const pendingPayment = payments.find((p: { status: string; paymentGateway?: string | null }) =>
        p.status === "PENDING" && p.paymentGateway === selectedGateway
      );
      if (!pendingPayment) return { action: t("confirmPayment"), status: "error" as const, message: t("resultNoPending"), timestamp: new Date() };

      const result = await confirmPaymentMutation.mutateAsync({ paymentId: pendingPayment.id });
      return {
        action: t("confirmPayment"),
        status: result.status === "SUCCEEDED" ? "success" as const : "pending" as const,
        message: t("resultPaymentStatus", { status: result.status }),
        data: { paymentId: result.paymentId, orderId: result.orderId, status: result.status },
        timestamp: new Date(),
      };
    });

  const testListOrders = () =>
    runAction(t("listOrders"), async () => {
      const result = await listOrdersQuery.refetch();
      const orders = result.data?.orders ?? [];
      return {
        action: t("listOrders"),
        status: "success" as const,
        message: t("resultOrderCount", { count: orders.length }),
        data: { count: orders.length, latest: orders[0] ? { id: orders[0].id, status: orders[0].status, amount: orders[0].amount } : null },
        timestamp: new Date(),
      };
    });

  const testListPayments = () =>
    runAction(t("listPayments"), async () => {
      const result = await listPaymentsQuery.refetch();
      const payments = result.data?.payments ?? [];
      return {
        action: t("listPayments"),
        status: "success" as const,
        message: t("resultPaymentCount", { count: payments.length }),
        data: {
          count: payments.length,
          latest: payments[0]
            ? { id: payments[0].id, status: payments[0].status, gateway: payments[0].paymentGateway, amount: payments[0].amount }
            : null,
        },
        timestamp: new Date(),
      };
    });

  const testGetBalance = () =>
    runAction(t("balance"), async () => {
      const result = await balanceQuery.refetch();
      const data = result.data;
      const available = data?.totalSummary?.available ?? 0;
      return {
        action: t("balance"),
        status: "success" as const,
        message: t("resultBalance", { available }),
        data: { available, total: data?.totalSummary?.total ?? 0, frozen: data?.totalSummary?.frozen ?? 0 },
        timestamp: new Date(),
      };
    });

  const testHasSavedCard = () =>
    runAction(t("savedCard"), async () => {
      const result = await hasSavedCardQuery.refetch();
      const hasCard = result.data;
      return {
        action: t("savedCard"),
        status: "success" as const,
        message: hasCard ? t("resultHasCard") : t("resultNoCard"),
        data: { hasSavedCard: !!hasCard },
        timestamp: new Date(),
      };
    });

  const testGetCryptoCurrencies = () =>
    runAction(t("cryptoCurrencies"), async () => {
      const result = await cryptoCurrenciesQuery.refetch();
      const currencies = result.data ?? [];
      return {
        action: t("cryptoCurrencies"),
        status: "success" as const,
        message: t("resultCryptoCount", { count: currencies.length }),
        data: { count: currencies.length, top5: currencies.slice(0, 5).map((c: unknown) => typeof c === "string" ? c : (c as { code?: string }).code ?? "?") },
        timestamp: new Date(),
      };
    });

  const testSubscriptionStatus = () =>
    runAction(t("subStatus"), async () => {
      const result = await subscriptionQuery.refetch();
      const data = result.data;
      return {
        action: t("subStatus"),
        status: "success" as const,
        message: t("resultSubStatus", { status: data?.status ?? "NONE" }),
        data: {
          status: data?.status,
          planType: (data as unknown as Record<string, unknown>)?.planType,
          subscriptionId: (data as unknown as Record<string, unknown>)?.subscriptionId,
        },
        timestamp: new Date(),
      };
    });

  // ── Actions definition per gateway ──

  interface TestAction {
    id: string;
    label: string;
    description: string;
    icon: React.ElementType;
    handler: () => void | Promise<void>;
    category: string;
  }

  const commonActions: TestAction[] = [
    { id: "list-orders", label: t("listOrders"), description: t("listOrdersDesc"), icon: ListOrdered, handler: testListOrders, category: t("catQuery") },
    { id: "list-payments", label: t("listPayments"), description: t("listPaymentsDesc"), icon: FileText, handler: testListPayments, category: t("catQuery") },
    { id: "balance", label: t("balance"), description: t("balanceDesc"), icon: Banknote, handler: testGetBalance, category: t("catQuery") },
    { id: "sub-status", label: t("subStatus"), description: t("subStatusDesc"), icon: Activity, handler: testSubscriptionStatus, category: t("catQuery") },
  ];

  const getActionsForGateway = (gw: Gateway): TestAction[] => {
    const actions: TestAction[] = [];

    actions.push({
      id: "one-time", label: t("oneTimePayment"), description: t("oneTimePaymentDesc"),
      icon: ShoppingCart, handler: testOneTimeCheckout, category: t("catCheckout"),
    });

    actions.push({
      id: "subscription", label: t("subscriptionPayment"), description: t("subscriptionPaymentDesc"),
      icon: Repeat, handler: testSubscriptionCheckout, category: t("catCheckout"),
    });

    actions.push({
      id: "confirm", label: t("confirmPayment"), description: t("confirmPaymentDesc"),
      icon: RefreshCw, handler: testConfirmPayment, category: t("catPaymentOps"),
    });

    if (gw === "STRIPE") {
      actions.push({
        id: "saved-card", label: t("savedCard"), description: t("savedCardDesc"),
        icon: CreditCard, handler: testHasSavedCard, category: t("catStripe"),
      });
    }

    if (gw === "NOWPAYMENTS") {
      actions.push({
        id: "crypto-currencies", label: t("cryptoCurrencies"), description: t("cryptoCurrenciesDesc"),
        icon: Wallet, handler: testGetCryptoCurrencies, category: t("catNowpayments"),
      });
    }

    actions.push(...commonActions);
    return actions;
  };

  // ── Render ──

  const selectedGw = gateways.find((g) => g.id === selectedGateway);
  const actions = selectedGateway ? getActionsForGateway(selectedGateway) : [];
  const categories = [...new Set(actions.map((a) => a.category))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === "test-actions" && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <DialogTitle>
                {step === "select-provider" ? t("title") : t("testCapabilities", { provider: selectedGw ? t(selectedGw.labelKey) : "" })}
              </DialogTitle>
              <DialogDescription>
                {step === "select-provider"
                  ? t("selectProvider")
                  : t("testCapabilities", { provider: selectedGw ? t(selectedGw.labelKey) : "" })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {step === "select-provider" && (
            <div className="grid gap-3 py-2">
              {gateways.map((gw) => {
                const available = isGatewayAvailable(gw.id);
                const loading = gatewaysQuery.isLoading;
                return (
                  <button
                    key={gw.id}
                    onClick={() => selectProvider(gw.id)}
                    disabled={!available || loading}
                    className={cn(
                      "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all",
                      available
                        ? "bg-card hover:bg-accent/50 hover:border-primary/40 active:scale-[0.98]"
                        : "bg-muted/30 opacity-60 cursor-not-allowed",
                    )}
                  >
                    <div className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-colors",
                      available
                        ? "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        : "bg-muted/50 text-muted-foreground/40",
                    )}>
                      {loading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : !available ? (
                        <Ban className="h-6 w-6" />
                      ) : (
                        <gw.icon className="h-6 w-6" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-semibold", available ? "text-foreground" : "text-muted-foreground")}>
                          {t(gw.labelKey)}
                        </span>
                        {!available && !loading && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-destructive border-destructive/30">
                            {t("notConfigured")}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{t(gw.descKey)}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {gw.featureKeys.map((fk) => (
                          <Badge key={fk} variant="secondary" className={cn("text-[10px] px-1.5 py-0", !available && "opacity-50")}>
                            {t(fk)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {available && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground/50 transition-transform group-hover:translate-x-0.5 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {step === "test-actions" && (
            <div className="space-y-5 py-2">
              {categories.map((cat) => (
                <div key={cat}>
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                    {cat}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {actions
                      .filter((a) => a.category === cat)
                      .map((action) => {
                        const isRunning = runningAction === action.label;
                        return (
                          <button
                            key={action.id}
                            onClick={() => { void action.handler(); }}
                            disabled={!!runningAction}
                            className={cn(
                              "flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 p-3 text-left transition-all",
                              "hover:bg-accent/50 hover:border-border active:scale-[0.98]",
                              runningAction && !isRunning && "opacity-40 pointer-events-none",
                            )}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">
                              {isRunning ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <action.icon className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground leading-tight">
                                {action.label}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                                {action.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}

              {results.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t("results")}
                    </h3>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={() => setResults([])}>
                      {t("clear")}
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[240px] overflow-y-auto">
                    {results.map((r, i) => (
                      <div
                        key={`${r.action}-${i}`}
                        className={cn(
                          "rounded-lg border p-3 text-sm",
                          r.status === "success" && "border-green-500/20 bg-green-500/5",
                          r.status === "error" && "border-red-500/20 bg-red-500/5",
                          r.status === "pending" && "border-yellow-500/20 bg-yellow-500/5",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {r.status === "success" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />}
                          {r.status === "error" && <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                          {r.status === "pending" && <RefreshCw className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{r.action}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {r.timestamp.toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{r.message}</p>
                            {r.data && (
                              <details className="mt-1">
                                <summary className="text-[11px] text-muted-foreground/70 cursor-pointer hover:text-muted-foreground">
                                  {t("expandDetails")}
                                </summary>
                                <pre className="mt-1 text-[10px] bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
                                  {JSON.stringify(r.data, null, 2)}
                                </pre>
                              </details>
                            )}
                            {r.data && "url" in r.data && typeof r.data.url === "string" && (
                              <a
                                href={r.data.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1.5 text-xs text-primary hover:underline"
                              >
                                {t("openCheckout")}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
