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
import {
  Loader2,
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";

export default function AffiliateCommissionsPage() {
  const t = useTranslations("admin.affiliateCommissions");
  const format = useFormatter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } =
    api.admin.listAffiliateCommissions.useQuery({
      page,
      pageSize: 20,
      search: debouncedSearch,
      status: status as "all" | "PENDING" | "AVAILABLE" | "VOIDED",
    });

  const updateStatusMutation =
    api.admin.updateAffiliateCommissionStatus.useMutation({
      onSuccess: () => {
        toast.success(t("statusUpdated"));
        void refetch();
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });

  const handleUpdateStatus = (
    id: string,
    newStatus: "VOIDED" | "AVAILABLE" | "PENDING",
  ) => {
    if (confirm(t("confirmStatus", { status: newStatus }))) {
      updateStatusMutation.mutate({ id, status: newStatus });
    }
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatuses")}</SelectItem>
            <SelectItem value="PENDING">{t("statuses.pending")}</SelectItem>
            <SelectItem value="AVAILABLE">{t("statuses.available")}</SelectItem>
            <SelectItem value="VOIDED">{t("statuses.voided")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("referrer")}</TableHead>
              <TableHead>{t("referredUser")}</TableHead>
              <TableHead>{t("source")}</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="w-[50px]"></TableHead>
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
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
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
                    <Link
                      href={`/admin/users/${item.referredUserId}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {item.referredUser.email}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span className="font-mono uppercase">
                        {item.sourceType.replace("_", " ")}
                      </span>
                      <span
                        className="text-muted-foreground max-w-[120px] truncate font-mono"
                        title={item.sourceExternalId}
                      >
                        {item.sourceExternalId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono">
                      <span className="font-bold text-green-600">
                        +
                        {format.number(item.commissionCents / 100, {
                          style: "currency",
                          currency: "USD",
                        })}
                      </span>
                      <div className="text-muted-foreground text-xs">
                        {t("onGrossAmount", {
                          amount: format.number(item.grossAmountCents / 100, {
                            style: "currency",
                            currency: "USD",
                          }),
                        })}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={item.state}
                      availableAt={item.availableAt}
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.state !== "VOIDED" && (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() =>
                              handleUpdateStatus(item.id, "VOIDED")
                            }
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            {t("voidEarning")}
                          </DropdownMenuItem>
                        )}
                        {item.state === "VOIDED" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(item.id, "AVAILABLE")
                            }
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {t("restoreAvailable")}
                          </DropdownMenuItem>
                        )}
                        {item.state === "PENDING" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleUpdateStatus(item.id, "AVAILABLE")
                            }
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {t("forceMature")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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

function StatusBadge({
  status,
  availableAt,
}: {
  status: string;
  availableAt: Date;
}) {
  const t = useTranslations("admin.affiliateCommissions");
  const format = useFormatter();
  const config = {
    PENDING: {
      color: "bg-amber-100 text-amber-800 border-amber-200",
      icon: Clock,
    },
    AVAILABLE: {
      color: "bg-green-100 text-green-800 border-green-200",
      icon: CheckCircle2,
    },
    VOIDED: {
      color: "bg-red-100 text-red-800 border-red-200",
      icon: AlertCircle,
    },
  }[status] || { color: "bg-gray-100 text-gray-800", icon: AlertCircle };

  const Icon = config.icon;

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="outline" className={`${config.color} gap-1 pr-2`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
      {status === "PENDING" && (
        <span className="text-muted-foreground text-[10px]">
          {t("unlocks", {
            date: format.dateTime(new Date(availableAt), {
              month: "short",
              day: "numeric",
            }),
          })}
        </span>
      )}
    </div>
  );
}
