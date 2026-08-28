"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLocale, useTranslations } from "next-intl"
import { formatPrice } from "./product-price-cell"
import type { RouterOutputs } from "@/trpc/react"

// Product type returned by the API
type Product = RouterOutputs["admin"]["listProducts"]["items"][number]

interface ProductDetailSheetProps {
  product: Product | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate?: () => void
}

export function ProductDetailSheet({
  product,
  open,
  onOpenChange,
  onUpdate: _onUpdate,
}: ProductDetailSheetProps) {
  const t = useTranslations("admin.productManagement")
  const locale = useLocale()
  if (!product) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:max-w-[800px] p-0 flex flex-col">
        <div className="p-6 border-b">
          <SheetHeader>
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-xl">{product.name}</SheetTitle>
                <SheetDescription className="mt-1 font-mono text-xs">
                  ID: {product.id}
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2">
                 <Badge variant={product.status === "ACTIVE" ? "default" : "secondary"}>
                  {product.status}
                </Badge>
                {product.isAvailable ? (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">{t("published")}</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">{t("unpublished")}</Badge>
                )}
              </div>
            </div>
          </SheetHeader>
        </div>

        <Tabs defaultValue="basic" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-2">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="basic">{t("basicInfo")}</TabsTrigger>
              <TabsTrigger value="pricing">{t("pricing")}</TabsTrigger>
              <TabsTrigger value="subscription" disabled={product.type !== "SUBSCRIPTION"}>
                {t("subscriptionTab")}
              </TabsTrigger>
              <TabsTrigger value="metadata">{t("metadataAirwallex")}</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              <TabsContent value="basic" className="space-y-6 m-0">
                <Section title={t("basicInfo")}>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label={t("productName")} value={product.name} />
                    <DetailItem label={t("productType")} value={product.type} />
                    <DetailItem label={t("sortOrder")} value={product.sortOrder} />
                    <DetailItem label={t("createdAt")} value={new Date(product.createdAt).toLocaleString(locale)} />
                  </div>
                </Section>

                <Section title={t("trial")}>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem
                      label={t("trialEnabled")}
                      value={product.hasTrial ? t("yes") : t("no")}
                    />
                    {product.hasTrial && (
                      <>
                        <DetailItem label={t("trialDays")} value={product.trialDays || "-"} />
                        <DetailItem label={t("trialBonusCredits")} value={product.trialCreditsAmount || "-"} />
                      </>
                    )}
                  </div>
                </Section>

                 <Section title={t("creditsPackage")} hidden={!product.creditsPackage}>
                  <div className="grid grid-cols-2 gap-4">
                     <DetailItem
                      label={t("creditsIncluded")}
                      value={product.creditsPackage?.creditsAmount}
                    />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-6 m-0">
                <Section title={t("defaultPrice")}>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem
                      label={t("currentPrice")}
                      value={formatPrice(product.price, product.currency, locale)}
                      className="text-lg font-medium text-primary"
                    />
                    <DetailItem
                      label={t("originalPriceStrike")}
                      value={product.originalPrice > 0 ? formatPrice(product.originalPrice, product.currency, locale) : "-"}
                      className="text-muted-foreground line-through"
                    />
                  </div>
                </Section>

                <Section title={t("multiCurrencyPricing")}>
                  {product.prices && product.prices.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t("currency")}</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t("currentPrice")}</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">{t("originalPrice")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {product.prices.map((price) => (
                            <tr key={price.currency}>
                              <td className="px-4 py-2 font-medium">{price.currency}</td>
                              <td className="px-4 py-2">{formatPrice(price.amount, price.currency, locale)}</td>
                              <td className="px-4 py-2 text-muted-foreground">
                                {price.originalAmount > 0 ? formatPrice(price.originalAmount, price.currency, locale) : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4 text-center border rounded-md border-dashed">
                      {t("noLocalizedPricingMsg")}
                    </div>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="subscription" className="space-y-6 m-0">
                 <Section title={t("subscriptionPlan")}>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Plan ID" value={product.productSubscription?.planId} />
                    <DetailItem label={t("interval")} value={product.productSubscription?.plan.interval} />
                    <DetailItem label={t("intervalCount")} value={product.productSubscription?.plan.intervalCount} />
                    <DetailItem label={t("perPeriodCredits")} value={product.productSubscription?.plan.creditsPerPeriod} />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="metadata" className="space-y-6 m-0">
                <Section title="Metadata">
                  <pre className="bg-muted p-4 rounded-md text-xs font-mono overflow-auto max-h-[300px]">
                    {JSON.stringify(product.metadata, null, 2)}
                  </pre>
                </Section>

                <Section title={t("fullMetadata")}>
                  <pre className="bg-muted p-4 rounded-md text-xs font-mono overflow-auto max-h-[300px]">
                    {JSON.stringify(product.metadata, null, 2)}
                  </pre>
                </Section>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children, hidden }: { title: string; children: React.ReactNode, hidden?: boolean }) {
  if (hidden) return null
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      <div className="bg-card rounded-lg border p-4 shadow-sm">
        {children}
      </div>
    </div>
  )
}

function DetailItem({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm ${className}`}>{value}</div>
    </div>
  )
}
