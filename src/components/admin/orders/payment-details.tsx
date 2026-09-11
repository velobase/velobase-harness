"use client"

import { Badge } from "@/components/ui/badge"
import { TableCell, TableRow } from "@/components/ui/table"
import { useTranslations, useLocale } from "next-intl"
import { paymentStatusConfig, formatPrice, formatDateTime } from "./utils"
import type { PaymentItem } from "./types"

interface PaymentDetailsProps {
  payments: PaymentItem[]
  currency: string
}

export function PaymentDetails({ payments, currency }: PaymentDetailsProps) {
  const t = useTranslations("admin.orders")
  const locale = useLocale()
  if (payments.length === 0) {
    return (
      <TableRow className="bg-muted/20">
        <TableCell colSpan={9} className="py-5 text-center text-sm text-muted-foreground">
          {t("detail.noPayments")}
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className="bg-muted/20">
      <TableCell colSpan={9} className="p-0">
        <div className="p-4">
          <h4 className="text-sm font-medium mb-2">{t("paymentsHeading", { count: payments.length })}</h4>
          <div className="divide-y divide-border">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="font-mono text-xs text-muted-foreground" title={payment.id}>
                    {payment.id.slice(0, 8)}...
                  </div>
                  <Badge variant={paymentStatusConfig[payment.status]?.variant ?? "outline"} className="text-xs">
                    {paymentStatusConfig[payment.status]?.labelKey ? t(paymentStatusConfig[payment.status]!.labelKey) : payment.status}
                  </Badge>
                  <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                    {formatPrice(payment.amount, currency, locale)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {payment.paymentGateway}
                  </span>
                  {payment.isSubscription && (
                    <span className="text-xs text-muted-foreground">{t("productTypes.subscription")}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {payment.gatewayTransactionId && (
                    <span className="font-mono text-xs text-muted-foreground" title={payment.gatewayTransactionId}>
                      {t("detail.transactionId")} {payment.gatewayTransactionId.slice(0, 12)}...
                    </span>
                  )}
                  <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(payment.createdAt, locale)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </TableCell>
    </TableRow>
  )
}
