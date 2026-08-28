"use client";

import { useEffect, useState } from "react";
import { api } from "@/trpc/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useFormatter, useTranslations } from "next-intl";

export default function AffiliatePayoutsPage() {
  const t = useTranslations("admin.affiliatePayouts");
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<"all" | "CASHOUT_USDT" | "EXCHANGE_CREDITS">(
    "all",
  );
  const [status, setStatus] = useState("all");
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<{
    id: string;
    type: string;
    amountCents: number;
    walletAddress: string | null;
  } | null>(null);
  const [txHash, setTxHash] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } =
    api.admin.listAffiliatePayoutRequests.useQuery({
      page,
      pageSize: 20,
      search: debouncedSearch,
      type,
      status: status as
        | "all"
        | "REQUESTED"
        | "APPROVED"
        | "COMPLETED"
        | "REJECTED"
        | "FAILED",
    });

  const updateMutation = api.admin.updateAffiliatePayoutRequest.useMutation({
    onSuccess: () => {
      toast.success(t("updated"));
      setCompleteDialogOpen(false);
      setTxHash("");
      setSelectedRequest(null);
      void refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAction = (
    request: {
      id: string;
      type: string;
      amountCents: number;
      walletAddress: string | null;
    },
    action: "APPROVE" | "REJECT" | "COMPLETE" | "FAIL",
  ) => {
    if (action === "COMPLETE") {
      if (request.type === "CASHOUT_USDT") {
        setSelectedRequest(request);
        setCompleteDialogOpen(true);
        return;
      }
    }

    if (confirm(t("confirmAction", { action }))) {
      updateMutation.mutate({ id: request.id, action });
    }
  };

  const handleCompleteSubmit = () => {
    if (!txHash) return toast.error(t("transactionHashRequired"));
    if (!selectedRequest) return;
    updateMutation.mutate({
      id: selectedRequest.id,
      action: "COMPLETE",
      txHash,
    });
  };

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      <div className="mb-6 flex gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onValueChange={(v) =>
            setType(v as "CASHOUT_USDT" | "EXCHANGE_CREDITS" | "all")
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTypes")}</SelectItem>
            <SelectItem value="CASHOUT_USDT">{t("types.cashout")}</SelectItem>
            <SelectItem value="EXCHANGE_CREDITS">
              {t("types.creditsExchange")}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="REQUESTED">{t("statuses.requested")}</SelectItem>
            <SelectItem value="APPROVED">{t("statuses.approved")}</SelectItem>
            <SelectItem value="COMPLETED">{t("statuses.completed")}</SelectItem>
            <SelectItem value="REJECTED">{t("statuses.rejected")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("user")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{t("destination")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
                </TableCell>
              </TableRow>
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground h-24 text-center"
                >
                  {t("noRequests")}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>
                        {format.dateTime(new Date(item.createdAt), {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {format.dateTime(new Date(item.createdAt), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/users/${item.affiliateUserId}`}
                      className="font-medium hover:underline"
                    >
                      {item.affiliateUser.email}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        item.type === "CASHOUT_USDT"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                      }
                    >
                      {item.type === "CASHOUT_USDT"
                        ? t("types.cashout")
                        : t("types.creditsExchange")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-bold">
                      {format.number(item.amountCents / 100, {
                        style: "currency",
                        currency: "USD",
                      })}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.type === "CASHOUT_USDT" ? (
                      <div
                        className="max-w-[150px] truncate font-mono text-xs"
                        title={item.walletAddress || ""}
                      >
                        {item.walletAddress}
                        {item.txHash && (
                          <a
                            href={`https://polygonscan.com/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 block text-blue-500 hover:underline"
                          >
                            {t("viewTransaction")}
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {t("internal")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === "REQUESTED" && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleAction(item, "REJECT")}
                        >
                          {t("reject")}
                        </Button>
                        {item.type === "CASHOUT_USDT" ? (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleAction(item, "COMPLETE")}
                          >
                            {t("markPaid")}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAction(item, "COMPLETE")}
                          >
                            {t("complete")}
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Complete Cashout Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("completeCashout")}</DialogTitle>
            <DialogDescription>
              {t.rich("completeCashoutDescription", {
                amount: format.number(
                  (selectedRequest?.amountCents ?? 0) / 100,
                  {
                    style: "currency",
                    currency: "USD",
                  },
                ),
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted mb-4 rounded-md border p-4 font-mono text-xs break-all select-all">
            {selectedRequest?.walletAddress}
          </div>

          <div className="space-y-2">
            <Label htmlFor="txHash">{t("transactionHash")}</Label>
            <Input
              id="txHash"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              placeholder="0x..."
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteDialogOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCompleteSubmit}
              disabled={!txHash || updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("confirmPayment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t("previous")}
          </Button>
          <div className="text-muted-foreground text-sm">
            {t("pageIndicator", { page, totalPages: data.totalPages })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    REQUESTED: {
      color: "bg-amber-100 text-amber-800 border-amber-200",
      icon: Clock,
    },
    APPROVED: {
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: CheckCircle2,
    },
    COMPLETED: {
      color: "bg-green-100 text-green-800 border-green-200",
      icon: CheckCircle2,
    },
    REJECTED: {
      color: "bg-red-100 text-red-800 border-red-200",
      icon: XCircle,
    },
    FAILED: { color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
  }[status] || { color: "bg-gray-100 text-gray-800", icon: Clock };

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.color} gap-1 pr-2`}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}
