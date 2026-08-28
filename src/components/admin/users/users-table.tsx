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
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useFormatter, useLocale, useTranslations } from "next-intl";

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
    <div className="mx-auto max-w-[1400px] space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {total > 0
              ? t("subtitleTotal", { count: total })
              : t("subtitleEmpty")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={t("searchPlaceholder")}
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
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(hasActiveFilters && "border-primary text-primary")}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-muted/30 space-y-4 rounded-lg border p-4">
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
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
                <SelectContent>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  <SelectItem value="active">{t("active")}</SelectItem>
                  <SelectItem value="blocked">{t("blocked")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                <SelectContent>
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
                <SelectContent>
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
                <SelectContent>
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
                <SelectContent>
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
                <SelectContent>
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
      <div className="bg-card rounded-md border">
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
                  className="text-muted-foreground py-10 text-center"
                >
                  {t("noUsers")}
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((user) => (
                <TableRow
                  key={user.id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleRowClick(user.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {user.image ? (
                        <img
                          src={user.image}
                          alt=""
                          className="h-7 w-7 rounded-full"
                        />
                      ) : (
                        <div className="bg-muted text-muted-foreground flex h-7 w-7 items-center justify-center rounded-full text-xs">
                          {user.name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate">
                          {user.name || t("notAvailable")}
                        </p>
                        {user.isAdmin && (
                          <Badge
                            variant="default"
                            className="h-4 px-1 text-[10px]"
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
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (user.email) {
                            void navigator.clipboard.writeText(user.email);
                            toast.success(t("emailCopied"));
                          }
                        }}
                        title={t("copyEmail")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.isBlocked ? (
                      <Badge variant="destructive" className="text-xs">
                        {t("blocked")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {t("active")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.isPrimaryDeviceAccount ? (
                      <Badge variant="default" className="text-xs">
                        {t("yes")}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-500 text-xs text-amber-600"
                      >
                        {t("no")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.hasPurchased ? (
                      <Badge variant="default" className="text-xs">
                        {t("yes")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        {t("no")}
                      </Badge>
                    )}
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
                  <TableCell className="text-muted-foreground text-xs">
                    {format.dateTime(new Date(user.createdAt), {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <Link
                          href={`/admin/users/${user.id}`}
                          title={t("viewDetails")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <Link
                          href={`/admin/works?userId=${user.id}`}
                          title={t("viewWorks")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Video className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8",
                          user.isBlocked
                            ? "text-green-600 hover:bg-green-50 hover:text-green-700"
                            : "text-red-600 hover:bg-red-50 hover:text-red-700",
                        )}
                        onClick={(e) =>
                          handleBlockToggle(e, user.id, user.isBlocked)
                        }
                        disabled={
                          blockMutation.isPending || unblockMutation.isPending
                        }
                        title={
                          user.isBlocked ? t("unblockUser") : t("blockUser")
                        }
                      >
                        {user.isBlocked ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Ban className="h-4 w-4" />
                        )}
                      </Button>
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
          <span>{t("rowsPerPage")}</span>
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
            <SelectContent>
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
              {t("pageIndicator", { page, totalPages })}
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
    </div>
  );
}
