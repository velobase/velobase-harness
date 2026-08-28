"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus } from "lucide-react";
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

interface DeductCreditsDialogProps {
  userId: string;
  userName: string | null;
  onSuccess?: () => void;
}

export function DeductCreditsDialog({
  userId,
  userName,
  onSuccess,
}: DeductCreditsDialogProps) {
  const t = useTranslations("admin.creditsManagement");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const deductMutation = api.admin.deductCredits.useMutation({
    onSuccess: () => {
      toast.success(t("deductSuccess", { count: Number(amount) }));
      setOpen(false);
      setAmount("");
      setReason("");
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDeduct = () => {
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error(t("validAmount"));
      return;
    }
    deductMutation.mutate({
      userId,
      amount: numAmount,
      reason: reason || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          <Minus className="mr-1 h-4 w-4" />
          {t("deduct")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deductTitle")}</DialogTitle>
          <DialogDescription>
            {t("deductDescription", { user: userName || userId })}
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
              placeholder={t("deductReasonPlaceholder")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeduct}
            disabled={deductMutation.isPending}
          >
            {deductMutation.isPending ? t("deducting") : t("deductTitle")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
