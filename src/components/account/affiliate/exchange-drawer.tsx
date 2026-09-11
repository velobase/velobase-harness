"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/trpc/react";

interface ExchangeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableCents: number;
  exchangeUnitCents: number;
  exchangeUnitCredits: number;
}
export function ExchangeDrawer({
  open,
  onOpenChange,
  availableCents,
  exchangeUnitCents,
  exchangeUnitCredits,
}: ExchangeDrawerProps) {
  const t = useTranslations("affiliateExchange");
  const utils = api.useUtils();
  const [units, setUnits] = useState(1);
  const attempt = useRef<{ requestId: string; units: number } | null>(null);
  const pending = api.affiliate.pendingExchange.useQuery(undefined, {
    enabled: open,
    refetchOnMount: "always",
  });
  const request = pending.data ?? attempt.current;
  const selectedUnits = request?.units ?? units;
  const maxUnits = Math.floor(availableCents / exchangeUnitCents);
  const mutation = api.affiliate.exchangeCredits.useMutation({
    onSuccess: () => {
      attempt.current = null;
      setUnits(1);
      toast.success(t("success"));
      onOpenChange(false);
      void utils.affiliate.pendingExchange.invalidate();
      void utils.affiliate.getStatus.invalidate();
      void utils.account.getBillingStatus.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      void utils.affiliate.pendingExchange.invalidate();
      void utils.affiliate.getStatus.invalidate();
    },
  });
  function confirm() {
    const next = request ?? { requestId: crypto.randomUUID(), units };
    attempt.current = next;
    mutation.mutate(next);
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("title")}</DrawerTitle>
          <DrawerDescription>{t("description")}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4">
          {request && <p className="text-sm text-amber-600">{t("pending")}</p>}
          <label className="block space-y-2">
            <span>{t("units")}</span>
            <Input
              type="number"
              min={1}
              max={Math.min(1000, maxUnits || 1)}
              value={selectedUnits}
              disabled={Boolean(request) || mutation.isPending}
              onChange={(event) =>
                setUnits(
                  Math.max(
                    1,
                    Math.min(
                      1000,
                      maxUnits || 1,
                      Math.floor(Number(event.target.value)) || 1,
                    ),
                  ),
                )
              }
            />
          </label>
          <p>
            {t("summary", {
              amount: ((selectedUnits * exchangeUnitCents) / 100).toFixed(2),
              credits: selectedUnits * exchangeUnitCredits,
            })}
          </p>
          {!request && maxUnits < 1 && <p>{t("insufficient")}</p>}
        </div>
        <DrawerFooter>
          <Button
            onClick={confirm}
            disabled={
              mutation.isPending ||
              pending.isFetching ||
              pending.isError ||
              (!request && maxUnits < 1)
            }
          >
            {mutation.isPending
              ? t("processing")
              : request
                ? t("resume")
                : t("confirm")}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">{t("close")}</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
