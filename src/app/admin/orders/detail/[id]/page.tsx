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
import { cn } from "@/lib/utils";
import { useFormatter, useTranslations } from "next-intl";

const statusColors: Record<string, string> = {
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  COMPLETED:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  CANCELLED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
};

const paymentStatusColors: Record<string, string> = {
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  SUCCESS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export default function OrderDetailPage() {
  const t = useTranslations("admin.orders");
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
      <div className="mx-auto max-w-5xl space-y-6 p-6">
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
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-red-500">
            {t("detail.notFound")}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/admin/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              {t("detail.title")}
              <Badge
                className={cn(
                  "text-xs",
                  statusColors[order.status] ?? "bg-gray-100",
                )}
              >
                {order.status}
              </Badge>
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              {order.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/users/${order.userId}`}>
              <User className="mr-2 h-4 w-4" />
              {t("detail.viewUser")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Main Info */}
        <div className="space-y-6 md:col-span-2">
          {/* Order Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                {t("detail.orderInformation")}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.amount")}
                </p>
                <p className="text-lg font-bold">
                  {formatPrice(order.amount, order.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("detail.type")}
                </p>
                <Badge variant="outline">{order.type}</Badge>
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
              <div className="grid grid-cols-2 gap-4">
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
                  <Badge variant="secondary">{order.product.type}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">
                    {t("detail.productId")}
                  </p>
                  <p className="font-mono text-xs">{order.productId}</p>
                </div>
              </div>

              {order.productSnapshot && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">
                    {t("detail.snapshotAtPurchase")}
                  </p>
                  <div className="bg-muted overflow-x-auto rounded-md p-3">
                    <pre className="text-xs">
                      {JSON.stringify(order.productSnapshot, null, 2)}
                    </pre>
                  </div>
                </div>
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
                <div className="space-y-4">
                  {order.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="space-y-2 rounded-lg border p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground font-mono text-xs">
                            {payment.id}
                          </span>
                          <Badge
                            className={cn(
                              "text-xs",
                              paymentStatusColors[payment.status] ??
                                "bg-gray-100",
                            )}
                          >
                            {payment.status}
                          </Badge>
                        </div>
                        <span className="font-bold">
                          {formatPrice(payment.amount, payment.currency)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
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
                          <div className="col-span-2">
                            <span className="text-muted-foreground">
                              {t("detail.transactionId")}
                            </span>{" "}
                            <span className="ml-1 font-mono">
                              {payment.gatewayTransactionId}
                            </span>
                          </div>
                        )}
                        {payment.gatewaySubscriptionId && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">
                              {t("detail.subscriptionId")}
                            </span>{" "}
                            <span className="ml-1 font-mono">
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
                <div className="mt-1 rounded-full bg-green-100 p-1 dark:bg-green-900">
                  <Calendar className="h-3 w-3 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t("detail.created")}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-blue-100 p-1 dark:bg-blue-900">
                  <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
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
