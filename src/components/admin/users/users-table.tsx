/* eslint-disable @next/next/no-img-element */
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
import { useState, useCallback, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Filter,
  X,
  Video,
  Ban,
  Check,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import "@/app/admin/users/users.css";

type FilterStatus = "all" | "active" | "blocked";
type FilterYesNo = "all" | "yes" | "no";

interface Filters {
  status: FilterStatus;
  isPrimary: FilterYesNo;
  hasPurchased: FilterYesNo;
  isAdmin: FilterYesNo;
  utmSource: string;
  countryCode: string;
  dateFrom: string;
  dateTo: string;
}

const defaultFilters: Filters = {
  status: "all",
  isPrimary: "all",
  hasPurchased: "all",
  isAdmin: "all",
  utmSource: "",
  countryCode: "",
  dateFrom: "",
  dateTo: "",
};

function getCountryName(
  code: string | null | undefined,
  displayNames: Intl.DisplayNames,
): string {
  if (!code) return "-";
  const normalizedCode = code.toUpperCase();
  return displayNames.of(normalizedCode) ?? normalizedCode;
}

function getCountryFlag(code: string | null | undefined): string {
  if (code?.length !== 2) return "";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function UsersTable() {
  const t = useTranslations("admin.userManagement");
  const format = useFormatter();
  const locale = useLocale();
  const regionNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: "region" }),
    [locale],
  );
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();

  const debouncedSearch = useDebounce(search, 500);

  const { data, isLoading } = api.admin.listUsers.useQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    status: filters.status,
    isPrimary: filters.isPrimary,
    hasPurchased: filters.hasPurchased,
    isAdmin: filters.isAdmin,
    utmSource: filters.utmSource || undefined,
    countryCode: filters.countryCode || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const { data: utmSources } = api.admin.getUtmSources.useQuery();
  const { data: countryCodes } = api.admin.getCountryCodes.useQuery();

  const utils = api.useUtils();

  const blockMutation = api.admin.blockUser.useMutation({
    onSuccess: () => {
      void utils.admin.listUsers.invalidate();
    },
  });

  const unblockMutation = api.admin.unblockUser.useMutation({
    onSuccess: () => {
      void utils.admin.listUsers.invalidate();
    },
  });

  const handleBlockToggle = (
    e: React.MouseEvent,
    userId: string,
    isBlocked: boolean,
  ) => {
    e.stopPropagation();
    if (isBlocked) {
      unblockMutation.mutate({ userId });
    } else {
      blockMutation.mutate({ userId });
    }
  };

  const handleRowClick = (userId: string) => {
    router.push(`/admin/users/${userId}`);
  };

  const updateFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1); // Reset to first page when filter changes
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setPage(1);
  }, []);

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => {
    if (
      key === "utmSource" ||
      key === "countryCode" ||
      key === "dateFrom" ||
      key === "dateTo"
    )
      return !!value;
    return value !== "all";
  });

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="admin-users mx-auto max-w-[1400px]">
      <h1 className="sr-only">{t("title")}</h1>

      <div className="users-list-toolbar">
        <div className="users-status-tabs" role="group" aria-label={t("status")}>
          {(["all", "active", "blocked"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filters.status === status}
              onClick={() => updateFilter("status", status)}
            >
              {t(status)}
            </button>
          ))}
        </div>
        <div className="users-search-tools">
          <div className="relative min-w-0 flex-1 sm:w-64">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-8 pl-9 text-xs shadow-none"
            />
          </div>
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="users-filters"
            className={cn("h-8 gap-2 text-xs shadow-none", hasActiveFilters && "border-primary/40 text-primary")}
          >
            <Filter className="h-4 w-4" />
            {t("filters")}
            {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div id="users-filters" className="users-filter-panel">
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
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("primaryAccount")}
              </label>
              <Select
                value={filters.isPrimary}
                onValueChange={(v) =>
                  updateFilter("isPrimary", v as FilterYesNo)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="yes">{t("yes")}</SelectItem>
                  <SelectItem value="no">{t("no")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("purchased")}
              </label>
              <Select
                value={filters.hasPurchased}
                onValueChange={(v) =>
                  updateFilter("hasPurchased", v as FilterYesNo)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="yes">{t("yes")}</SelectItem>
                  <SelectItem value="no">{t("no")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("role")}
              </label>
              <Select
                value={filters.isAdmin}
                onValueChange={(v) => updateFilter("isAdmin", v as FilterYesNo)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="yes">{t("admin")}</SelectItem>
                  <SelectItem value="no">{t("user")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("utmSource")}
              </label>
              <Select
                value={filters.utmSource || "all"}
                onValueChange={(v) =>
                  updateFilter("utmSource", v === "all" ? "" : v)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("all")} />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {utmSources?.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("country")}
              </label>
              <Select
                value={filters.countryCode || "all"}
                onValueChange={(v) =>
                  updateFilter("countryCode", v === "all" ? "" : v)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("all")} />
                </SelectTrigger>
                <SelectContent className="admin-theme admin-popup">
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {countryCodes?.map((code) => (
                    <SelectItem key={code} value={code}>
                      {getCountryFlag(code)} {getCountryName(code, regionNames)}{" "}
                      ({code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("fromDate")}
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="text-muted-foreground text-xs">
                {t("toDate")}
              </label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="users-table-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">{t("user")}</TableHead>
              <TableHead>{t("email")}</TableHead>
              <TableHead className="w-[80px]">{t("status")}</TableHead>
              <TableHead className="w-[80px]">{t("primary")}</TableHead>
              <TableHead className="w-[80px]">{t("paid")}</TableHead>
              <TableHead className="w-[100px]">{t("country")}</TableHead>
              <TableHead className="w-[100px]">{t("utmSource")}</TableHead>
              <TableHead className="w-[100px]">{t("joined")}</TableHead>
              <TableHead className="w-[48px]"><span className="sr-only">{t("actions")}</span></TableHead>
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
                    <Skeleton className="h-4 w-[200px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[50px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[50px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[60px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[80px]" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-[30px]" />
                  </TableCell>
                </TableRow>
              ))
            ) : data?.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-20 text-center"
                >
                  <Users className="mx-auto mb-3 h-7 w-7 opacity-40" />
                  <p className="text-sm font-medium text-foreground">{t("noUsers")}</p>
                  {(search || hasActiveFilters) && (
                    <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={() => { setSearch(""); clearFilters(); }}>
                      {t("clearAll")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((user) => (
                <TableRow
                  key={user.id}
                  className="users-data-row cursor-pointer"
                  onClick={() => handleRowClick(user.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt=""
                          className="users-avatar h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="users-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs">
                          {user.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link href={`/admin/users/${user.id}`} className="users-name block truncate" onClick={(e) => e.stopPropagation()}>
                          {user.name || t("notAvailable")}
                        </Link>
                        {user.isAdmin && (
                          <Badge
                            variant="secondary"
                            className="mt-1 h-4 rounded px-1.5 text-[10px] font-normal"
                          >
                            {t("admin")}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1">
                      <span className="max-w-[200px] truncate">
                        {user.email}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="users-copy-button h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (user.email) {
                            void navigator.clipboard.writeText(user.email);
                            toast.success(t("emailCopied"));
                          }
                        }}
                        title={t("copyEmail")}
                        aria-label={t("copyEmail")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("users-status", user.isBlocked ? "is-blocked" : "is-active")}>
                      <span aria-hidden="true" />
                      {user.isBlocked ? t("blocked") : t("active")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-xs", !user.isPrimaryDeviceAccount && "text-muted-foreground")}>
                      {user.isPrimaryDeviceAccount ? t("yes") : t("no")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("text-xs", !user.hasPurchased && "text-muted-foreground")}>
                      {user.hasPurchased ? t("yes") : t("no")}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {user.countryCode ? (
                      <span
                        title={getCountryName(user.countryCode, regionNames)}
                      >
                        {getCountryFlag(user.countryCode)} {user.countryCode}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {user.utmSource || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                    <span title={format.dateTime(new Date(user.createdAt), { dateStyle: "medium", timeStyle: "medium" })}>
                    {format.dateTime(new Date(user.createdAt), {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={t("actions")} onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="admin-theme admin-popup w-44" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/users/${user.id}`}><ExternalLink className="h-4 w-4" />{t("viewDetails")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/works?userId=${user.id}`}><Video className="h-4 w-4" />{t("viewWorks")}</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={cn(!user.isBlocked && "text-destructive focus:text-destructive")}
                          onClick={(e) => handleBlockToggle(e, user.id, user.isBlocked)}
                          disabled={blockMutation.isPending || unblockMutation.isPending}
                        >
                          {user.isBlocked ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                          {user.isBlocked ? t("unblockUser") : t("blockUser")}
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
      <div className="users-pagination flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>{t("rowsPerPage")}</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-[70px] shadow-none" aria-label={t("rowsPerPage")}>
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
              ? t("resultRange", {
                  start: format.number(startItem),
                  end: format.number(endItem),
                  total: format.number(total),
                })
              : t("zeroResults")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("firstPage")}
              onClick={() => setPage(1)}
              disabled={page === 1 || isLoading}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("previousPage")}
              onClick={() => setPage(page - 1)}
              disabled={page === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-24 text-center text-xs tabular-nums">
              {t("pageIndicator", { page, totalPages })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("nextPage")}
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages || isLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t("lastPage")}
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages || isLoading}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
