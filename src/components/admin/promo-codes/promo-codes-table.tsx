"use client";

import Link from "next/link";
import { api } from "@/trpc/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  FileText,
  MoreHorizontal,
  Users,
  Search,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useFormatter, useTranslations, useLocale } from "next-intl";

export function PromoCodesTable() {
  const t = useTranslations("admin.promoCodes");
  const format = useFormatter();
  const locale = useLocale();

  const statusLabels: Record<string, string> = {
    DRAFT: t("statuses.draft"),
    ACTIVE: t("statuses.active"),
    DISABLED: t("statuses.inactive"),
    EXPIRED: t("statuses.expired"),
    UNDEFINED: t("statuses.undefined"),
  };

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "DRAFT" | "ACTIVE" | "DISABLED" | "EXPIRED"
  >("all");
  const [grantTypeFilter, setGrantTypeFilter] = useState<
    "all" | "CREDIT" | "PRODUCT"
  >("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<{
    code: string;
    notes: string;
  } | null>(null);

  const debouncedSearch = useDebounce(search, 500);
  const utils = api.useUtils();

  const { data, isLoading } = api.admin.listPromoCodes.useQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: statusFilter,
    grantType: grantTypeFilter,
  });

  const createMutation = api.admin.createPromoCode.useMutation({
    onSuccess: () => {
      toast.success(t("createSuccess"));
      setShowCreateDialog(false);
      void utils.admin.listPromoCodes.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = api.admin.deletePromoCode.useMutation({
    onSuccess: () => {
      toast.success(t("deleteSuccess"));
      void utils.admin.listPromoCodes.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = api.admin.updatePromoCode.useMutation({
    onSuccess: () => {
      toast.success(t("statusUpdated"));
      void utils.admin.listPromoCodes.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="admin-module-page admin-promo-codes space-y-4">
      {/* Header */}
      <div className="admin-module-toolbar">
        <h1 className="sr-only">{t("title")}</h1>
        <div className="admin-module-tools">
          <div className="relative flex-1 sm:w-72">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              aria-label={t("searchPlaceholder")} placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as typeof statusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]" aria-label={t("status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="admin-theme admin-popup">
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              <SelectItem value="DRAFT">{t("statuses.draft")}</SelectItem>
              <SelectItem value="ACTIVE">{t("statuses.active")}</SelectItem>
              <SelectItem value="DISABLED">{t("statuses.inactive")}</SelectItem>
              <SelectItem value="EXPIRED">{t("statuses.expired")}</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={grantTypeFilter}
            onValueChange={(v) => {
              setGrantTypeFilter(v as typeof grantTypeFilter);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[150px]" aria-label={t("grant")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="admin-theme admin-popup">
              <SelectItem value="all">{t("allRewards")}</SelectItem>
              <SelectItem value="CREDIT">{t("grantTypes.credits")}</SelectItem>
              <SelectItem value="PRODUCT">{t("grantTypes.product")}</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("create")}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="admin-table-surface">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/4">{t("code")}</TableHead>
              <TableHead className="w-1/5">{t("grant")}</TableHead>
              <TableHead className="w-[150px]">{t("status")}</TableHead>
              <TableHead className="w-[160px]">{t("usage")}</TableHead>
              <TableHead className="w-[160px]">{t("expiresAt")}</TableHead>
              <TableHead className="w-14">
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-[120px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[50px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("noPromoCodes")}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((promo) => (
                <TableRow key={promo.id}>
                  <TableCell className="whitespace-nowrap font-mono font-medium">
                    {promo.code}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {promo.grantType === "CREDIT"
                      ? t("creditsGrant", { count: promo.creditsAmount })
                      : promo.productId
                        ? t("productGrant")
                        : "-"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={promo.status}
                      disabled={updateMutation.isPending}
                      onValueChange={(v) =>
                        updateMutation.mutate({
                          id: promo.id,
                          status: v as
                            | "DRAFT"
                            | "ACTIVE"
                            | "DISABLED"
                            | "EXPIRED",
                        })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="promo-status-select w-[120px]"
                        aria-label={t("statusFor", { code: promo.code })}
                      >
                        <SelectValue>
                          {statusLabels[promo.status] || promo.status}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="admin-theme admin-popup">
                        <SelectItem value="DRAFT">
                          {t("statuses.draft")}
                        </SelectItem>
                        <SelectItem value="ACTIVE">
                          {t("statuses.active")}
                        </SelectItem>
                        <SelectItem value="DISABLED">
                          {t("statuses.inactive")}
                        </SelectItem>
                        <SelectItem value="EXPIRED">
                          {t("statuses.expired")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      href={`/admin/promo-codes/${promo.id}`}
                      aria-label={t("viewRedemptionsFor", { code: promo.code })}
                      title={t("viewRedemptions")}
                    >
                      {format.number(promo.usedCount)}
                      <span>/</span>
                      {promo.usageLimit === 0 ? "∞" : format.number(promo.usageLimit)}
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {promo.expiresAt
                      ? new Date(promo.expiresAt).toLocaleString(locale, {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        })
                      : t("permanent")}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          aria-label={t("actionsFor", { code: promo.code })}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="admin-theme admin-popup min-w-44">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/promo-codes/${promo.id}`}>
                            <Users />
                            {t("viewRedemptions")}
                          </Link>
                        </DropdownMenuItem>
                        {promo.notes && (
                          <DropdownMenuItem onSelect={() => setSelectedNotes({ code: promo.code, notes: promo.notes! })}>
                            <FileText />
                            {t("viewNotes")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={deleteMutation.isPending}
                          onSelect={() => {
                            if (confirm(t("deleteConfirm"))) {
                              deleteMutation.mutate({ id: promo.id });
                            }
                          }}
                        >
                          <Trash2 />
                          {t("delete")}
                        </DropdownMenuItem>
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
      <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>{t("perPage")}</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="admin-theme admin-popup">
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-6">
          <span className="text-muted-foreground text-sm">
            {total > 0
              ? `${format.number(startItem)}-${format.number(endItem)} / ${format.number(total)}`
              : t("zeroResults")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(page - 1)}
              disabled={page === 1 || isLoading}
              aria-label={t("previousPage")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-20 text-center text-sm">
              {t("pageIndicator", { page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || isLoading}
              aria-label={t("nextPage")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={selectedNotes !== null} onOpenChange={(open) => { if (!open) setSelectedNotes(null); }}>
        <DialogContent className="admin-theme admin-module-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedNotes?.code}</DialogTitle>
            <DialogDescription>{t("notes")}</DialogDescription>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">
            {selectedNotes?.notes}
          </p>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <CreatePromoCodeDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />
    </div>
  );
}

function CreatePromoCodeDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    code: string;
    grantType: "CREDIT" | "PRODUCT";
    creditsAmount?: number;
    productId?: string;
    startsAt?: string;
    usageLimit?: number;
    perUserLimit?: number;
    expiresAt?: string;
    notes?: string;
  }) => void;
  isPending: boolean;
}) {
  const t = useTranslations("admin.promoCodes");
  const [code, setCode] = useState("");
  const [grantType, setGrantType] = useState<"CREDIT" | "PRODUCT">("CREDIT");
  const [productId, setProductId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [creditsAmount, setCreditsAmount] = useState(100);
  const [usageLimit, setUsageLimit] = useState(0);
  const [perUserLimit, setPerUserLimit] = useState(1);
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      code,
      grantType,
      productId: grantType === "PRODUCT" ? productId : undefined,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      creditsAmount: grantType === "CREDIT" ? creditsAmount : 0,
      usageLimit,
      perUserLimit,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      notes: notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="admin-theme admin-module-dialog sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <p className="text-muted-foreground text-sm">{t("draftHelp")}</p>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="code">{t("code")}</Label>
              <Input
                id="code"
                placeholder="PROMO2024"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("grantTypeLabel")}</Label>
              <Select
                value={grantType}
                onValueChange={(v) => setGrantType(v as "CREDIT" | "PRODUCT")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="CREDIT">
                    {t("grantTypes.credits")}
                  </SelectItem>
                  <SelectItem value="PRODUCT">
                    {t("grantTypes.product")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {grantType === "PRODUCT" && (
              <div className="grid gap-2">
                <Label htmlFor="reward-product">{t("productId")}</Label>
                <Input
                  id="reward-product"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  required
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="startsAt">{t("startsAt")}</Label>
              <Input
                id="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>
            {grantType === "CREDIT" && (
              <div className="grid gap-2">
                <Label htmlFor="credits">{t("creditsAmountLabel")}</Label>
                <Input
                  id="credits"
                  type="number"
                  min={1}
                  value={creditsAmount}
                  onChange={(e) => setCreditsAmount(Number(e.target.value))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="usageLimit">{t("usageLimitLabel")}</Label>
                <Input
                  id="usageLimit"
                  type="number"
                  min={0}
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(Number(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="perUserLimit">{t("perUserLimitLabel")}</Label>
                <Input
                  id="perUserLimit"
                  type="number"
                  min={0}
                  value={perUserLimit}
                  onChange={(e) => setPerUserLimit(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expiresAt">{t("expiresAtLabel")}</Label>
              <Input
                id="expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">{t("notes")}</Label>
              <Input
                id="notes"
                placeholder={t("notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending || !code.trim()}>
              {isPending ? t("creating") : t("createSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
