"use client";

import * as React from "react";
import { CreditCard, Receipt, Wallet, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type PaymentPreference = "STRIPE" | "LEMONSQUEEZY" | "NOWPAYMENTS";

const OPTIONS: { value: PaymentPreference; label: string; icon: React.ElementType }[] = [
  { value: "STRIPE", label: "Credit Card", icon: CreditCard },
  { value: "LEMONSQUEEZY", label: "LemonSqueezy", icon: Receipt },
  { value: "NOWPAYMENTS", label: "Cryptocurrency", icon: Wallet },
];

export function PaymentMethodRow() {
  const [open, setOpen] = React.useState(false);
  
  const utils = api.useUtils();
  const { data, isLoading } = api.account.getPaymentGatewayPreference.useQuery();
  const mutation = api.account.setPaymentGatewayPreference.useMutation({
    onSuccess: (_data, variables) => {
      // Update cache immediately so the row reflects the new choice without waiting for refetch
      utils.account.getPaymentGatewayPreference.setData(undefined, {
        preference: variables.preference,
      });
      void utils.account.getPaymentGatewayPreference.invalidate();
      toast.success("Payment method updated");
      setOpen(false);
    },
    onError: () => {
      toast.error("Failed to update");
    },
  });

  const rawValue = data?.preference ?? "AUTO";
  const currentValue: PaymentPreference =
    rawValue === "NOWPAYMENTS" || rawValue === "LEMONSQUEEZY" ? rawValue : "STRIPE";
  const currentOption = OPTIONS.find((o) => o.value === currentValue) ?? OPTIONS[0]!;
  const CurrentIcon = currentOption.icon;

  const handleSelect = (value: PaymentPreference) => {
    if (value === currentValue || mutation.isPending) return;
    mutation.mutate({ preference: value });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-between p-4 w-full text-left hover:bg-muted/50 transition-colors"
      >
        <span className="font-medium">Payment Method</span>
        <div className="flex items-center gap-2 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <CurrentIcon className="w-4 h-4" />
              <span className="text-sm">{currentOption.label}</span>
            </>
          )}
          <ChevronRight className="w-4 h-4" />
        </div>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Payment Method</DrawerTitle>
            <DrawerDescription>
              Choose your default payment method for purchases
            </DrawerDescription>
          </DrawerHeader>
          
          <div className="p-4 pb-8 space-y-2">
            {OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = currentValue === option.value;
              
              return (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  disabled={mutation.isPending}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all active:scale-[0.98]",
                    isSelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/30",
                    mutation.isPending && "opacity-50 pointer-events-none"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  
                  <span className="flex-1 font-medium">{option.label}</span>

                  <div
                    className={cn(
                      "h-5 w-5 rounded-full border-2 shrink-0 transition-colors flex items-center justify-center",
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

