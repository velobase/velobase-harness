"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  catalogUpdateSchema,
  parseProductPrice,
  supportedCurrencies,
} from "@velobase/products";
import { api, type RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Product = RouterOutputs["admin"]["listProducts"]["items"][number];
const decimal = (value: number | undefined) =>
  value === undefined ? "" : (value / 100).toFixed(2);

export function CatalogEditor({
  product,
  onSaved,
}: {
  product: Product;
  onSaved(): void;
}) {
  const t = useTranslations("productCatalog");
  const [invalid, setInvalid] = useState(false);
  const utils = api.useUtils();
  const update = api.admin.updateProduct.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.admin.listProducts.invalidate(),
        utils.product.invalidate(),
      ]);
      onSaved();
    },
  });
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (update.isPending) return;
    const form = new FormData(event.currentTarget);
    setInvalid(false);
    update.reset();
    try {
      const details = catalogUpdateSchema.parse({
        name: form.get("name"),
        ...(typeof product.description === "string"
          ? { description: form.get("description") }
          : {}),
        price: parseProductPrice(form.get("price")),
        originalPrice: form.get("originalPrice")
          ? parseProductPrice(form.get("originalPrice"))
          : 0,
        sortOrder: Number(form.get("sortOrder")),
        prices: supportedCurrencies
          .filter(
            (currency) => currency !== "USD" && form.get(`price-${currency}`),
          )
          .map((currency) => ({
            currency,
            amount: parseProductPrice(form.get(`price-${currency}`)),
            originalAmount: form.get(`original-${currency}`)
              ? parseProductPrice(form.get(`original-${currency}`))
              : 0,
          })),
      });
      update.mutate({
        ...details,
        currency: "USD",
        productId: product.id,
        revision: new Date(product.updatedAt).toISOString(),
      });
    } catch {
      setInvalid(true);
    }
  }
  const error = update.error?.data?.code;
  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-muted-foreground text-sm">{t("editHelp")}</p>
      {(invalid || update.error) && (
        <p role="alert" className="text-destructive text-sm">
          {t(
            invalid || error === "BAD_REQUEST"
              ? "invalid"
              : error === "CONFLICT"
                ? "conflict"
                : "failed",
          )}
        </p>
      )}
      <fieldset className="space-y-4" disabled={update.isPending}>
        <label className="block space-y-1">
          <span>{t("name")}</span>
          <Input
            name="name"
            defaultValue={product.name}
            required
            maxLength={200}
          />
        </label>
        {typeof product.description === "string" && (
          <label className="block space-y-1">
            <span>{t("description")}</span>
            <Textarea
              name="description"
              defaultValue={product.description}
              maxLength={20000}
            />
          </label>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span>USD — {t("price")}</span>
            <Input
              name="price"
              inputMode="decimal"
              defaultValue={decimal(product.price)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span>USD — {t("originalPrice")}</span>
            <Input
              name="originalPrice"
              inputMode="decimal"
              defaultValue={
                product.originalPrice ? decimal(product.originalPrice) : ""
              }
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span>{t("sortOrder")}</span>
          <Input
            name="sortOrder"
            type="number"
            step={1}
            min={-2_147_483_648}
            max={2_147_483_647}
            defaultValue={product.sortOrder}
          />
        </label>
        <h3 className="font-semibold">{t("localPrices")}</h3>
        <p className="text-muted-foreground text-sm">{t("fallback")}</p>
        {supportedCurrencies
          .filter((currency) => currency !== "USD")
          .map((currency) => {
            const price =
              product.prices.find((entry) => entry.currency === currency) ??
              product.prices.find(
                (entry) => entry.currency.toUpperCase() === currency,
              );
            return (
              <div key={currency} className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span>
                    {currency} — {t("price")}
                  </span>
                  <Input
                    name={`price-${currency}`}
                    inputMode="decimal"
                    defaultValue={decimal(price?.amount)}
                  />
                </label>
                <label className="block space-y-1">
                  <span>
                    {currency} — {t("originalPrice")}
                  </span>
                  <Input
                    name={`original-${currency}`}
                    inputMode="decimal"
                    defaultValue={
                      price?.originalAmount ? decimal(price.originalAmount) : ""
                    }
                  />
                </label>
              </div>
            );
          })}
        <Button type="submit" disabled={update.isPending}>
          {t(update.isPending ? "saving" : "save")}
        </Button>
      </fieldset>
    </form>
  );
}
