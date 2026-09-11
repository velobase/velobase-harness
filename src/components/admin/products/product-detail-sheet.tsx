"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "./product-price-cell";
import type { RouterOutputs } from "@/trpc/react";
import { CatalogEditor } from "@/modules/products/components/catalog-editor";

// Product type returned by the API
type Product = RouterOutputs["admin"]["listProducts"]["items"][number];

interface ProductDetailSheetProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export function ProductDetailSheet({
  product,
  open,
  onOpenChange,
  onUpdate,
}: ProductDetailSheetProps) {
  const t = useTranslations("admin.productManagement");
  const catalog = useTranslations("productCatalog");
  const locale = useLocale();
  if (!product) return null;
  const productTypeLabels: Record<string, string> = {
    SUBSCRIPTION: t("subscription"),
    CREDITS_PACKAGE: t("creditsPackage"),
    ONE_TIME_ENTITLEMENT: t("oneTimeEntitlement"),
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="admin-theme admin-module-dialog flex w-full flex-col p-0 sm:max-w-[800px]">
        <div className="border-b p-6 pr-12">
          <SheetHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-xl">{product.name}</SheetTitle>
                <SheetDescription className="mt-1 break-all font-mono text-xs">
                  ID: {product.id}
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    product.status === "ACTIVE" ? "secondary" : "outline"
                  }
                >
                  {product.status === "ACTIVE" ? t("active") : product.status === "INACTIVE" ? t("inactive") : product.status}
                </Badge>
                {product.isAvailable ? (
                  <Badge
                    variant="outline"
                  >
                    {t("published")}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("unpublished")}
                  </Badge>
                )}
              </div>
            </div>
          </SheetHeader>
        </div>

        <Tabs
          defaultValue="basic"
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="overflow-x-auto px-6 pt-2">
            <TabsList className="w-max min-w-full justify-start">
              <TabsTrigger value="basic">{t("basicInfo")}</TabsTrigger>
              <TabsTrigger value="pricing">{t("pricing")}</TabsTrigger>
              <TabsTrigger value="edit">{catalog("edit")}</TabsTrigger>
              {product.type === "SUBSCRIPTION" && (
                <TabsTrigger value="subscription">{t("subscriptionTab")}</TabsTrigger>
              )}
              <TabsTrigger value="metadata">
                {t("metadata")}
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-6 p-6">
              <TabsContent value="edit" className="m-0">
                <CatalogEditor
                  key={`${product.id}:${new Date(product.updatedAt).toISOString()}`}
                  product={product}
                  onSaved={() => {
                    onUpdate?.();
                    onOpenChange(false);
                  }}
                />
              </TabsContent>
              <TabsContent value="basic" className="m-0 space-y-6">
                <Section title={t("basicInfo")}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailItem label={t("productName")} value={product.name} />
                    <DetailItem label={t("productType")} value={productTypeLabels[product.type] ?? product.type} />
                    <DetailItem
                      label={t("sortOrder")}
                      value={product.sortOrder}
                    />
                    <DetailItem
                      label={t("createdAt")}
                      value={new Date(product.createdAt).toLocaleString(locale)}
                    />
                  </div>
                </Section>

                <Section title={t("trial")} hidden={product.type !== "SUBSCRIPTION"}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailItem
                      label={t("trialEnabled")}
                      value={product.hasTrial ? t("yes") : t("no")}
                    />
                    {product.hasTrial && (
                      <>
                        <DetailItem
                          label={t("trialDays")}
                          value={product.trialDays || "-"}
                        />
                        <DetailItem
                          label={t("trialBonusCredits")}
                          value={product.trialCreditsAmount || "-"}
                        />
                      </>
                    )}
                  </div>
                </Section>

                <Section
                  title={t("creditsPackage")}
                  hidden={!product.creditsPackage}
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailItem
                      label={t("creditsIncluded")}
                      value={product.creditsPackage?.creditsAmount}
                    />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="pricing" className="m-0 space-y-6">
                <Section title={t("defaultPrice")}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailItem
                      label={t("currentPrice")}
                      value={formatPrice(product.price, "USD", locale)}
                      className="whitespace-nowrap text-lg font-medium tabular-nums"
                    />
                    <DetailItem
                      label={t("originalPriceStrike")}
                      value={
                        product.originalPrice > product.price
                          ? formatPrice(product.originalPrice, "USD", locale)
                          : "-"
                      }
                      className={product.originalPrice > product.price ? "whitespace-nowrap text-muted-foreground line-through tabular-nums" : "text-muted-foreground"}
                    />
                  </div>
                </Section>

                <Section title={t("multiCurrencyPricing")}>
                  {product.prices && product.prices.length > 0 ? (
                    <div className="admin-table-surface">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-muted-foreground px-4 py-2 text-left font-medium">
                              {t("currency")}
                            </th>
                            <th className="text-muted-foreground px-4 py-2 text-left font-medium">
                              {t("currentPrice")}
                            </th>
                            <th className="text-muted-foreground px-4 py-2 text-left font-medium">
                              {t("originalPrice")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {product.prices.map((price) => (
                            <tr key={price.currency}>
                              <td className="px-4 py-2 font-medium">
                                {price.currency}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                                {formatPrice(
                                  price.amount,
                                  price.currency,
                                  locale,
                                )}
                              </td>
                              <td className="whitespace-nowrap text-muted-foreground px-4 py-2 tabular-nums">
                                {price.originalAmount > price.amount
                                  ? formatPrice(
                                      price.originalAmount,
                                      price.currency,
                                      locale,
                                    )
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-muted-foreground rounded-md border border-dashed py-4 text-center text-sm">
                      {t("noLocalizedPricingMsg")}
                    </div>
                  )}
                </Section>
              </TabsContent>

              <TabsContent value="subscription" className="m-0 space-y-6">
                <Section title={t("subscriptionPlan")}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailItem
                      label={t("planId")}
                      value={product.productSubscription?.planId}
                    />
                    <DetailItem
                      label={t("interval")}
                      value={product.productSubscription?.plan.interval
                        ? t.has(`intervals.${product.productSubscription.plan.interval.toLowerCase()}`)
                          ? t(`intervals.${product.productSubscription.plan.interval.toLowerCase()}`)
                          : product.productSubscription.plan.interval
                        : "-"}
                    />
                    <DetailItem
                      label={t("intervalCount")}
                      value={product.productSubscription?.plan.intervalCount}
                    />
                    <DetailItem
                      label={t("perPeriodCredits")}
                      value={product.productSubscription?.plan.creditsPerPeriod}
                    />
                  </div>
                </Section>
              </TabsContent>

              <TabsContent value="metadata" className="m-0 space-y-6">
                <Section title={t("fullMetadata")}>
                  <pre className="bg-muted max-h-[300px] overflow-auto rounded-md p-4 font-mono text-xs">
                    {JSON.stringify(product.metadata, null, 2)}
                  </pre>
                </Section>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  children,
  hidden,
}: {
  title: string;
  children: React.ReactNode;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      <div className="border-b border-border pb-5">{children}</div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={`break-words text-sm ${className ?? ""}`}>{value ?? "-"}</div>
    </div>
  );
}
