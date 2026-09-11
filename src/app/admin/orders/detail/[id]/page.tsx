"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  User,
  CreditCard,
  Calendar,
  Package,
  ExternalLink,
  Receipt,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { statusConfig, paymentStatusConfig, typeKeys } from "@/components/admin/orders/utils";

export default function OrderDetailPage() {
  const t = useTranslations("admin.orders");
  const productTypeLabels: Record<string, string> = {
    SUBSCRIPTION: t("productTypes.subscription"),
    CREDITS_PACKAGE: t("productTypes.creditsPackage"),
    ONE_TIME_ENTITLEMENT: t("productTypes.entitlement"),
  };
  const format = useFormatter();
  const params = useParams();
  const id = params.id as string;

  const formatPrice = (price: number, currency: string) =>
    format.number(price / 100, {
      style: "currency",
      currency: currency.toUpperCase(),
    });

  const formatDate = (date: Date | string | null) =>
    date
      ? format.dateTime(new Date(date), {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      : "-";

  const { data: order, isLoading } = api.admin.getOrder.useQuery(
    { orderId: id },
    { enabled: !!id },
  );

  if (isLoading) {
    return (
      <div className="admin-module-page space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px]" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="admin-module-page space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/orders" aria-label={t("backToOrders")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-destructive">
            {t("detail.notFound")}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-module-page space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admin/orders" aria-label={t("backToOrders")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {t("detail.title")}
              <Badge
                variant={statusConfig[order.status]?.variant ?? "outline"}
              >
                {statusConfig[order.status] ? t(statusConfig[order.status]!.labelKey) : order.status}
              </Badge>
            </h1>
            <p className="mt-1 break-all text-muted-foreground font-mono text-xs">
              {order.id}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Main Info */}
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                {t("detail.orderInformation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.amount")}
                </p>
                <p className="whitespace-nowrap text-xl font-medium tabular-nums">
                  {formatPrice(order.amount, order.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.type")}
                </p>
                <p className="text-sm">{typeKeys[order.type] ? t(typeKeys[order.type]!) : order.type}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.createdAt")}
                </p>
                <p className="font-medium">{formatDate(order.createdAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.expiresAt")}
                </p>
                <p className="font-medium">{formatDate(order.expiresAt)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.updatedAt")}
                </p>
                <p className="font-medium">{formatDate(order.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Product Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                {t("detail.productDetails")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-sm">
                    {t("detail.productName")}
                  </p>
                  <p className="font-medium">{order.product.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">
                    {t("detail.productType")}
                  </p>
                  <p className="text-sm">{productTypeLabels[order.product.type] ?? order.product.type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">
                    {t("detail.productId")}
                  </p>
                  <p className="break-all font-mono text-xs">{order.productId}</p>
                </div>
              </div>

              {order.productSnapshot && (
                <details className="border-t pt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    {t("detail.snapshotAtPurchase")}
                  </summary>
                  <div className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3">
                    <pre className="text-xs">
                      {JSON.stringify(order.productSnapshot, null, 2)}
                    </pre>
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                {t("detail.paymentHistory")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.payments.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  {t("detail.noPayments")}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {order.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="space-y-3 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="break-all text-muted-foreground font-mono text-xs">
                            {payment.id}
                          </span>
                          <Badge
                            variant={paymentStatusConfig[payment.status]?.variant ?? "outline"}
                          >
                            {paymentStatusConfig[payment.status] ? t(paymentStatusConfig[payment.status]!.labelKey) : payment.status}
                          </Badge>
                        </div>
                        <span className="whitespace-nowrap font-medium tabular-nums">
                          {formatPrice(payment.amount, payment.currency)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 break-words text-sm sm:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground">
                            {t("detail.gateway")}
                          </span>{" "}
                          {payment.paymentGateway}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            {t("detail.date")}
                          </span>{" "}
                          {formatDate(payment.createdAt)}
                        </div>
                        {payment.gatewayTransactionId && (
                          <div className="sm:col-span-2">
                            <span className="text-muted-foreground">
                              {t("detail.transactionId")}
                            </span>{" "}
                            <span className="ml-1 break-all font-mono text-xs">
                              {payment.gatewayTransactionId}
                            </span>
                          </div>
                        )}
                        {payment.gatewaySubscriptionId && (
                          <div className="sm:col-span-2">
                            <span className="text-muted-foreground">
                              {t("detail.subscriptionId")}
                            </span>{" "}
                            <span className="ml-1 break-all font-mono text-xs">
                              {payment.gatewaySubscriptionId}
                            </span>
                          </div>
                        )}
                      </div>

                      {(payment.gatewayResponse || payment.extra) && (
                        <div className="mt-2">
                          <details className="text-xs">
                            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                              {t("detail.rawData")}
                            </summary>
                            <div className="mt-2 space-y-2">
                              {payment.gatewayResponse && (
                                <div>
                                  <p className="font-semibold">
                                    {t("detail.gatewayResponse")}
                                  </p>
                                  <pre className="bg-muted overflow-x-auto rounded p-2">
                                    {JSON.stringify(
                                      payment.gatewayResponse,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                              {payment.extra && (
                                <div>
                                  <p className="font-semibold">
                                    {t("detail.extraData")}
                                  </p>
                                  <pre className="bg-muted overflow-x-auto rounded p-2">
                                    {JSON.stringify(payment.extra, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* User Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t("detail.customer")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                {order.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={order.user.image}
                    alt=""
                    className="h-10 w-10 rounded-full"
                  />
                ) : (
                  <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                    <User className="text-muted-foreground h-5 w-5" />
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="truncate font-medium">
                    {order.user.name || t("detail.noName")}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">
                    {order.user.email}
                  </p>
                </div>
              </div>
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/admin/users/${order.userId}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t("detail.viewUserProfile")}
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Timeline / Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                {t("detail.timeline")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-muted p-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t("detail.created")}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-muted p-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {t("detail.lastUpdated")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(order.updatedAt)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
