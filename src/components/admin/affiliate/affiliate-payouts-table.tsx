"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CompletePayoutDialog } from "./complete-payout-dialog";
import { useFormatter, useTranslations } from "next-intl";

type FilterStatus =
  | "all"
  | "REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "FAILED";
type FilterType = "all" | "CASHOUT_USDT" | "EXCHANGE_CREDITS";

const statusVariant: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  REQUESTED: "outline",
  APPROVED: "secondary",
  COMPLETED: "default",
  REJECTED: "destructive",
  FAILED: "destructive",
};

export function AffiliatePayoutsTable() {
  const t = useTranslations("admin.affiliatePayouts");
  const format = useFormatter();
  const utils = api.useUtils();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<FilterStatus>("REQUESTED");
  const [type, setType] = useState<FilterType>("CASHOUT_USDT");
  const [search, setSearch] = useState("");
  const { data, isLoading } = api.admin.listAffiliatePayoutRequests.useQuery({
    page,
    pageSize,
    status,
    type,
    search: search || undefined,
  });

  const mutate = api.admin.updateAffiliatePayoutRequest.useMutation({
    onSuccess: async () => {
      toast.success(t("operationsUpdated"));
      await utils.admin.listAffiliatePayoutRequests.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("operationsSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder={t("operationsSearchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-80"
          />
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as FilterType);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("type")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASHOUT_USDT">CASHOUT_USDT</SelectItem>
              <SelectItem value="EXCHANGE_CREDITS">EXCHANGE_CREDITS</SelectItem>
              <SelectItem value="all">all</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as FilterStatus);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="REQUESTED">REQUESTED</SelectItem>
              <SelectItem value="APPROVED">APPROVED</SelectItem>
              <SelectItem value="COMPLETED">COMPLETED</SelectItem>
              <SelectItem value="REJECTED">REJECTED</SelectItem>
              <SelectItem value="FAILED">FAILED</SelectItem>
              <SelectItem value="all">all</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">{t("created")}</TableHead>
              <TableHead className="w-[220px]">{t("user")}</TableHead>
              <TableHead className="w-[120px]">{t("type")}</TableHead>
              <TableHead className="w-[120px]">{t("amount")}</TableHead>
              <TableHead>{t("wallet")}</TableHead>
              <TableHead className="w-[140px]">{t("status")}</TableHead>
              <TableHead>txHash</TableHead>
              <TableHead className="w-[280px] text-right">
                {t("actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-10 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : (data?.items?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("noRequestsShort")}
                </TableCell>
              </TableRow>
            ) : (
              data!.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {format.dateTime(new Date(r.createdAt))}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">
                      {r.affiliateUser.email ?? r.affiliateUserId}
                    </div>
                    <div className="text-muted-foreground">
                      {r.affiliateUserId}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.type}</TableCell>
                  <TableCell className="font-semibold">
                    {format.number(r.amountCents / 100, {
                      style: "currency",
                      currency: "USD",
                    })}
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all">
                    {r.walletAddress ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status] ?? "outline"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs break-all">
                    {r.txHash ?? "-"}
                  </TableCell>
                  <TableCell className="space-x-2 text-right">
                    {(r.status === "REQUESTED" || r.status === "APPROVED") && (
                      <>
                        {r.status === "REQUESTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              mutate.mutate({ id: r.id, action: "APPROVE" })
                            }
                            disabled={mutate.isPending}
                          >
                            {t("approve")}
                          </Button>
                        )}
                        <CompletePayoutDialog
                          requestId={r.id}
                          type={r.type}
                          defaultTxHash={r.txHash}
                          onSuccess={() =>
                            utils.admin.listAffiliatePayoutRequests.invalidate()
                          }
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            mutate.mutate({ id: r.id, action: "FAIL" })
                          }
                          disabled={mutate.isPending}
                        >
                          {t("fail")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            mutate.mutate({ id: r.id, action: "REJECT" })
                          }
                          disabled={mutate.isPending}
                        >
                          {t("reject")}
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          {t("previousShort")}
        </Button>
        <div className="text-muted-foreground text-sm">
          {t("pageSlashIndicator", { page, totalPages })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          {t("next")}
        </Button>
      </div>
    </div>
  );
}
