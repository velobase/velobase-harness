"use client";

import * as React from "react";
import { CreditCard, Receipt, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";

type PaymentPreference = "STRIPE" | "LEMONSQUEEZY" | "NOWPAYMENTS";

const OPTIONS: { value: PaymentPreference; label: string; description: string; icon: React.ElementType }[] = [
  {
    value: "STRIPE",
    label: "Credit Card",
    description: "Pay securely with Stripe",
    icon: CreditCard,
  },
  {
    value: "LEMONSQUEEZY",
    label: "LemonSqueezy",
    description: "Merchant of Record checkout",
    icon: Receipt,
  },
  {
    value: "NOWPAYMENTS",
    label: "Cryptocurrency",
    description: "Pay with USDT, BTC, ETH, etc.",
    icon: Wallet,
  },
];

export function PaymentPreferenceSelect() {
  const { data, isLoading } = api.account.getPaymentGatewayPreference.useQuery();
  const mutation = api.account.setPaymentGatewayPreference.useMutation({
    onSuccess: () => {
      toast.success("Payment preference updated");
    },
    onError: () => {
      toast.error("Failed to update preference");
    },
  });

  const rawValue = data?.preference ?? "AUTO";
  const currentValue: PaymentPreference =
    rawValue === "NOWPAYMENTS" || rawValue === "LEMONSQUEEZY" ? rawValue : "STRIPE";

  const handleSelect = (value: PaymentPreference) => {
    if (value === currentValue || mutation.isPending) return;
    mutation.mutate({ preference: value });
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = currentValue === option.value;
        
        return (
          <button
            key={option.value}
            onClick={() => handleSelect(option.value)}
            disabled={mutation.isPending}
            className={cn(
              "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:border-primary/30 hover:bg-muted/30",
              mutation.isPending && "opacity-50 pointer-events-none"
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground truncate">{option.description}</div>
            </div>

            <div
              className={cn(
                "h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
                isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
              )}
            >
              {isSelected && (
                <div className="h-full w-full flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

