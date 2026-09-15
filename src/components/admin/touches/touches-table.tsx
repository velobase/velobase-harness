"use client";

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
import { useState, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Filter,
  X,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Ban,
  Copy,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useFormatter, useTranslations, useLocale } from "next-intl";

type FilterStatus =
  | "all"
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "CANCELLED"
  | "SUPERSEDED"
  | "FAILED"
  | "UNKNOWN";
type FilterChannel = "all" | "EMAIL" | "SMS" | "PUSH";

type TouchRecordRendered = {
  subject?: string;
  text?: string;
  html?: string;
};

type TouchRecordMeta = {
  provider?: string;
  reason?: string;
  template?: string | null;
  schedulePayload?: unknown;
  rendered?: TouchRecordRendered;
};

function parseTouchRecordMeta(meta: unknown): TouchRecordMeta | null {
  if (!meta || typeof meta !== "object") return null;

  const m = meta as Record<string, unknown>;
  const renderedRaw = m.rendered;

  let rendered: TouchRecordRendered | undefined;
  if (renderedRaw && typeof renderedRaw === "object") {
    const r = renderedRaw as Record<string, unknown>;
    rendered = {
      subject: typeof r.subject === "string" ? r.subject : undefined,
      text: typeof r.text === "string" ? r.text : undefined,
      html: typeof r.html === "string" ? r.html : undefined,
    };
  }

  return {
    provider: typeof m.provider === "string" ? m.provider : undefined,
    reason: typeof m.reason === "string" ? m.reason : undefined,
    template:
      typeof m.template === "string"
        ? m.template
        : m.template === null
          ? null
          : undefined,
    schedulePayload: m.schedulePayload,
    rendered,
  };
}

interface Filters {
  status: FilterStatus;
  sceneKey: string;
  channel: FilterChannel;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: Filters = {
  status: "all",
  sceneKey: "",
  channel: "all",
  dateFrom: "",
  dateTo: "",
};

function getStatusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PENDING":
      return "outline";
    case "PROCESSING":
      return "secondary";
    case "SENT":
      return "default";
    case "CANCELLED":
    case "SUPERSEDED":
      return "secondary";
    case "UNKNOWN":
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "PENDING":
      return <Clock className="h-3 w-3" />;
    case "PROCESSING":
      return <AlertCircle className="h-3 w-3" />;
    case "SENT":
      return <CheckCircle2 className="h-3 w-3" />;
    case "CANCELLED":
    case "SUPERSEDED":
      return <Ban className="h-3 w-3" />;
    case "UNKNOWN":
      return <AlertCircle className="h-3 w-3" />;
    case "FAILED":
      return <XCircle className="h-3 w-3" />;
    default:
      return null;
  }
}

function formatDate(date: Date | string, locale: string) {
  return new Date(date).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDaysUntil(
  date: Date | string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
) {
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return t("relative.daysAgo", { count: Math.abs(days) });
  if (days === 0) return t("relative.today");
  if (days === 1) return t("relative.tomorrow");
  return t("relative.daysLater", { count: days });
}

export function TouchesTable() {
  const t = useTranslations("admin.touches");
  const format = useFormatter();
  const locale = useLocale();

  const statusLabels: Record<string, string> = {
    PENDING: t("statuses.pending"),
    PROCESSING: t("statuses.processing"),
    SENT: t("statuses.sent"),
    CANCELLED: t("statuses.cancelled"),
    SUPERSEDED: t("statuses.superseded"),
    FAILED: t("statuses.failed"),
    UNKNOWN: t("statuses.unknown"),
  };

  const sceneLabels: Record<string, string> = {
    sub_renewal_reminder_d1: t("scenes.sub_renewal_reminder_d1"),
  };

  const channelLabels: Record<string, string> = {
    EMAIL: t("channels.EMAIL"),
    SMS: t("channels.SMS"),
    PUSH: t("channels.PUSH"),
  };

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 500);

  const utils = api.useUtils();

  const { data, isLoading } = api.admin.listTouchSchedules.useQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: filters.status,
    sceneKey: filters.sceneKey || undefined,
    channel: filters.channel,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const cancelSchedule = api.admin.cancelTouchSchedule.useMutation({
    onSuccess: () => {
      void utils.admin.listTouchSchedules.invalidate();
      toast.success(t("cancelToast"));
    },
    onError: (err) => toast.error(err.message),
  });

  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setPage(1);
  }, []);

  const hasActiveFilters = Object.entries(filters).some(
    ([, value]) => value !== "all" && value !== "",
  );

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const detailsQuery = api.admin.getTouchScheduleDetails.useQuery(
    { id: detailsId ?? "" },
    { enabled: Boolean(detailsId) },
  );

  const copyText = useCallback(
    async (label: string, value?: string | null) => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        toast.success(t("copied", { label }));
      } catch {
        toast.error(t("copyFailed"));
      }
    },
    [t],
  );

  return (
    <div className="admin-module-page space-y-4">
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
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm" aria-label={t("filters")} aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
            className={cn(hasActiveFilters && "border-primary text-primary")}
          >
            <Filter className="h-4 w-4" />
            {t("filters")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="admin-module-filters space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t("filters")}</h3>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-7 text-xs"
              >
                <X className="mr-1 h-3 w-3" />
                {t("clearAll")}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("status")}
              </label>
              <Select
                value={filters.status}
                onValueChange={(v) => updateFilter("status", v as FilterStatus)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="PENDING">
                    {t("statuses.pending")}
                  </SelectItem>
                  <SelectItem value="PROCESSING">
                    {t("statuses.processing")}
                  </SelectItem>
                  <SelectItem value="SENT">{t("statuses.sent")}</SelectItem>
                  <SelectItem value="CANCELLED">
                    {t("statuses.cancelled")}
                  </SelectItem>
                  <SelectItem value="SUPERSEDED">
                    {t("statuses.superseded")}
                  </SelectItem>
                  <SelectItem value="FAILED">{t("statuses.failed")}</SelectItem>
                  <SelectItem value="UNKNOWN">
                    {t("statuses.unknown")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("scene")}
              </label>
              <Select
                value={filters.sceneKey || "all"}
                onValueChange={(v) =>
                  updateFilter("sceneKey", v === "all" ? "" : v)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="sub_renewal_reminder_d1">
                    {t("scenes.sub_renewal_reminder_d1")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("channel")}
              </label>
              <Select
                value={filters.channel}
                onValueChange={(v) =>
                  updateFilter("channel", v as FilterChannel)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="EMAIL">{t("channels.EMAIL")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("scheduledFrom")}
              </label>
              <Input
                type="datetime-local"
                value={filters.dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("scheduledTo")}
              </label>
              <Input
                type="datetime-local"
                value={filters.dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="admin-table-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">{t("user")}</TableHead>
              <TableHead className="w-[140px]">{t("scene")}</TableHead>
              <TableHead className="w-[80px]">{t("channel")}</TableHead>
              <TableHead className="w-[100px]">{t("status")}</TableHead>
              <TableHead className="w-[140px]">{t("scheduledAt")}</TableHead>
              <TableHead className="w-[140px]">{t("nextAttempt")}</TableHead>
              <TableHead className="w-[90px]">{t("attempts")}</TableHead>
              <TableHead className="w-[220px]">{t("errorReason")}</TableHead>
              <TableHead className="w-[120px]">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: pageSize }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-[150px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[50px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[100px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[200px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[50px]" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("noSchedules")}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {schedule.user?.name || "-"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {schedule.user?.email}
                      </p>
                      <div className="text-muted-foreground mt-1 flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          className="hover:text-foreground inline-flex items-center gap-1"
                          onClick={() =>
                            void copyText("scheduleId", schedule.id)
                          }
                        >
                          <Copy className="h-3 w-3" />
                          <span className="max-w-[140px] truncate">
                            {schedule.id}
                          </span>
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {schedule.sceneKey
                        ? sceneLabels[schedule.sceneKey] || schedule.sceneKey
                        : "-"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Mail className="h-3 w-3" />
                      {channelLabels[schedule.channel] || schedule.channel}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getStatusVariant(schedule.status)}
                      className="gap-1 text-xs"
                    >
                      {getStatusIcon(schedule.status)}
                      {statusLabels[schedule.status] || schedule.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(schedule.scheduledAt, locale)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(schedule.nextAttemptAt, locale)}
                    {schedule.status === "PENDING" && (
                      <div className="mt-0.5">
                        <span
                          className={cn(
                            new Date(schedule.nextAttemptAt).getTime() -
                              Date.now() <
                              24 * 60 * 60 * 1000
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {getDaysUntil(schedule.nextAttemptAt, t)}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {schedule.attemptCount}/{schedule.maxAttempts}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <span
                      className={cn(
                        schedule.status === "FAILED"
                          ? "text-destructive"
                          : undefined,
                      )}
                    >
                      {schedule.lastError
                        ? String(schedule.lastError).slice(0, 120)
                        : "-"}
                      {schedule.lastError &&
                      String(schedule.lastError).length > 120
                        ? "…"
                        : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setDetailsId(schedule.id)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {t("details")}
                      </Button>

                      {(schedule.status === "PENDING" ||
                        (schedule.status === "PROCESSING" &&
                          schedule.referenceType !== "OUTREACH")) && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-7 text-xs"
                            >
                              {t("cancel")}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="admin-theme admin-module-dialog">
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("cancelTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("cancelDesc")}
                                {schedule.status === "PROCESSING"
                                  ? t("cancelProcessingSuffix")
                                  : ""}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("cancelBack")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  cancelSchedule.mutate({
                                    id: schedule.id,
                                    reason: "Admin cancelled",
                                  })
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("cancelConfirm")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
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
              <SelectItem value="100">100</SelectItem>
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
              onClick={() => setPage(1)}
              disabled={page === 1 || isLoading}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(page - 1)}
              disabled={page === 1 || isLoading}
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
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || isLoading}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(detailsId)}
        onOpenChange={(open) => !open && setDetailsId(null)}
      >
        <DialogContent className="admin-theme admin-module-dialog max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("detailsTitle")}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            {detailsQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-[60%]" />
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : detailsQuery.data ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("scheduleId")}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs break-all">
                        {detailsQuery.data.id}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          void copyText("scheduleId", detailsQuery.data.id)
                        }
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {t("copy")}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("user")}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate">
                        <span className="font-medium">
                          {detailsQuery.data.user?.name || "-"}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {detailsQuery.data.user?.email || "-"}
                        </span>
                      </div>
                      {detailsQuery.data.user?.email && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() =>
                            void copyText(
                              "email",
                              detailsQuery.data.user?.email,
                            )
                          }
                        >
                          <Copy className="mr-1 h-3 w-3" />
                          {t("copyEmail")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("sceneChannelStatus")}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {detailsQuery.data.sceneKey
                          ? sceneLabels[detailsQuery.data.sceneKey] ||
                            detailsQuery.data.sceneKey
                          : "-"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {channelLabels[detailsQuery.data.channel] ||
                          detailsQuery.data.channel}
                      </Badge>
                      <Badge
                        variant={getStatusVariant(detailsQuery.data.status)}
                        className="gap-1 text-xs"
                      >
                        {getStatusIcon(detailsQuery.data.status)}
                        {statusLabels[detailsQuery.data.status] ||
                          detailsQuery.data.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("scheduledNext")}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      scheduledAt:{" "}
                      {formatDate(detailsQuery.data.scheduledAt, locale)} <br />
                      nextAttemptAt:{" "}
                      {formatDate(detailsQuery.data.nextAttemptAt, locale)}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("attemptCount")}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {detailsQuery.data.attemptCount}/
                      {detailsQuery.data.maxAttempts}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("reference")}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs break-all">
                        {detailsQuery.data.referenceType}:
                        {detailsQuery.data.referenceId}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          void copyText(
                            t("reference"),
                            detailsQuery.data.referenceId,
                          )
                        }
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {t("copy")}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs">
                      {t("dedupeKey")}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs break-all">
                        {detailsQuery.data.dedupeKey}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          void copyText(
                            t("dedupeKey"),
                            detailsQuery.data.dedupeKey,
                          )
                        }
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        {t("copy")}
                      </Button>
                    </div>
                  </div>
                </div>

                {detailsQuery.data.lastError && (
                  <div className="bg-muted/30 rounded-md border p-3">
                    <div className="text-muted-foreground mb-1 text-xs">
                      {t("errorReason")}
                    </div>
                    <pre className="text-xs break-words whitespace-pre-wrap">
                      {String(detailsQuery.data.lastError)}
                    </pre>
                  </div>
                )}

                <details className="border-y py-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    {t("payload")}
                  </summary>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs break-words whitespace-pre-wrap">
                    {JSON.stringify(detailsQuery.data.payload ?? null, null, 2)}
                  </pre>
                </details>

                <div className="space-y-2">
                  <div className="text-muted-foreground text-xs">
                    {t("records")}
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[70px]">
                            {t("attempt")}
                          </TableHead>
                          <TableHead className="w-[120px]">{t("status")}</TableHead>
                          <TableHead className="w-[160px]">
                            {t("time")}
                          </TableHead>
                          <TableHead>{t("subjectError")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailsQuery.data.records.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-muted-foreground py-6 text-center"
                            >
                              {t("noRecords")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          detailsQuery.data.records.map((r) => {
                            const meta = parseTouchRecordMeta(r.meta);
                            const rendered = meta?.rendered;
                            return (
                              <TableRow key={r.id}>
                                <TableCell className="text-muted-foreground text-xs">
                                  {r.attemptNumber}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">
                                  {r.status}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">
                                  {formatDate(r.occurredAt, locale)}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs">
                                  <div className="space-y-1">
                                    <div className="truncate">
                                      <span className="text-foreground font-medium">
                                        {r.subject || "-"}
                                      </span>
                                      {r.toEmail ? (
                                        <span className="text-muted-foreground">
                                          {" "}
                                          · {r.toEmail}
                                        </span>
                                      ) : null}
                                    </div>
                                    {r.error ? (
                                      <div className="text-destructive break-words">
                                        {r.error}
                                      </div>
                                    ) : null}
                                    {rendered?.text ? (
                                      <details className="mt-1">
                                        <summary className="text-primary cursor-pointer text-xs select-none">
                                          {t("previewText")}
                                        </summary>
                                        <pre className="mt-2 text-xs break-words whitespace-pre-wrap">
                                          {String(rendered.text)}
                                        </pre>
                                      </details>
                                    ) : null}
                                    {rendered?.html ? (
                                      <details className="mt-1">
                                        <summary className="text-primary cursor-pointer text-xs select-none">
                                          {t("viewHtml")}
                                        </summary>
                                        <pre className="mt-2 text-xs break-words whitespace-pre-wrap">
                                          {String(rendered.html)}
                                        </pre>
                                      </details>
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">
                {t("loadFailed")}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
