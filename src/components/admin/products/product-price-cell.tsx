import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ChevronDown } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

type Price = {
  currency: string
  amount: number
  originalAmount: number
}

interface ProductPriceCellProps {
  price: number
  originalPrice: number
  currency: string
  prices?: Price[]
}

export function formatPrice(price: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(price / 100)
}

export function ProductPriceCell({ price, originalPrice, currency, prices }: ProductPriceCellProps) {
  const t = useTranslations("admin.productManagement")
  const locale = useLocale()
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium hover:underline cursor-pointer group">
        <span>{formatPrice(price, currency, locale)}</span>
        {originalPrice > 0 && (
          <span className="text-xs text-muted-foreground line-through ml-1">
            {formatPrice(originalPrice, currency, locale)}
          </span>
        )}
        {prices && prices.length > 0 && (
          <ChevronDown className="h-3 w-3 text-muted-foreground group-data-[state=open]:rotate-180 transition-transform" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5">
        {prices?.map((p) => (
          <div key={p.currency} className="text-xs text-muted-foreground flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-mono">
              {p.currency}
            </Badge>
            <span className="font-medium text-foreground">
              {formatPrice(p.amount, p.currency, locale)}
            </span>
            {p.originalAmount > 0 && (
              <span className="line-through">
                {formatPrice(p.originalAmount, p.currency, locale)}
              </span>
            )}
          </div>
        ))}
        {(!prices || prices.length === 0) && (
          <div className="text-xs text-muted-foreground italic">{t("noLocalizedPrices")}</div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
