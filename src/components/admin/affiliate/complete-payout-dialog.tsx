"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function CompletePayoutDialog(props: {
  requestId: string;
  type: "CASHOUT_USDT" | "EXCHANGE_CREDITS";
  defaultTxHash?: string | null;
  onSuccess?: () => void;
}) {
  const t = useTranslations("admin.affiliatePayouts");
  const [open, setOpen] = useState(false);
  const [txHash, setTxHash] = useState(props.defaultTxHash ?? "");
  const [adminNote, setAdminNote] = useState("");

  const mutation = api.admin.updateAffiliatePayoutRequest.useMutation({
    onSuccess: () => {
      toast.success(t("operationsUpdated"));
      setOpen(false);
      props.onSuccess?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    mutation.mutate({
      id: props.requestId,
      action: "COMPLETE",
      txHash: txHash || undefined,
      adminNote: adminNote || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{t("complete")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("completePayout")}</DialogTitle>
          <DialogDescription>
            {t("completePayoutDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="txHash">
              txHash (
              {props.type === "CASHOUT_USDT" ? t("required") : t("optional")})
            </Label>
            <Input
              id="txHash"
              placeholder="0x..."
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adminNote">{t("adminNoteOptional")}</Label>
            <Input
              id="adminNote"
              placeholder={t("notePlaceholder")}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? t("saving") : t("complete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
