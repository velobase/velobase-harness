export const statusConfig: Record<string, { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { labelKey: "statuses.pending", variant: "outline" },
  COMPLETED: { labelKey: "statuses.completed", variant: "default" },
  CANCELLED: { labelKey: "statuses.cancelled", variant: "secondary" },
  EXPIRED: { labelKey: "statuses.expired", variant: "destructive" },
}

export const typeKeys: Record<string, string> = {
  NEW_PURCHASE: "types.newPurchase",
  RENEWAL: "types.renewal",
  UPGRADE: "types.upgrade",
}

export const paymentStatusConfig: Record<string, { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING: { labelKey: "paymentStatuses.pending", variant: "outline" },
  SUCCESS: { labelKey: "paymentStatuses.success", variant: "default" },
  FAILED: { labelKey: "paymentStatuses.failed", variant: "destructive" },
  CANCELLED: { labelKey: "paymentStatuses.cancelled", variant: "secondary" },
}

export function formatPrice(price: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(price / 100)
}

export function formatDateTime(date: Date | string, locale: string) {
  return new Date(date).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
