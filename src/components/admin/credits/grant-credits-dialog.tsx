"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";

interface GrantCreditsDialogProps {
  userId: string;
  userName: string | null;
  onSuccess?: () => void;
}

export function GrantCreditsDialog({
  userId,
  userName,
  onSuccess,
}: GrantCreditsDialogProps) {
  const t = useTranslations("admin.creditsManagement");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const grantMutation = api.admin.grantCredits.useMutation({
    onSuccess: () => {
      toast.success(t("grantSuccess", { count: Number(amount) }));
      setOpen(false);
      setAmount("");
      setReason("");
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleGrant = () => {
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(t("validAmount"));
      return;
    }
    grantMutation.mutate({
      userId,
      amount: numAmount,
      reason: reason || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gift className="mr-1 h-4 w-4" />
          {t("grant")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("grantTitle")}</DialogTitle>
          <DialogDescription>
            {t("grantDescription", { user: userName || userId })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="amount">{t("amount")}</Label>
            <Input
              id="amount"
              type="number"
              placeholder={t("amountPlaceholder")}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reason">{t("reasonOptional")}</Label>
            <Input
              id="reason"
              placeholder={t("grantReasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleGrant} disabled={grantMutation.isPending}>
            {grantMutation.isPending ? t("granting") : t("grantTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
