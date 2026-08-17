"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"
import { useTranslations } from "next-intl"
import type { Filters, FilterStatus, FilterType } from "./types"

interface OrderFiltersProps {
  filters: Filters
  onFilterChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
}

export function OrderFilters({ filters, onFilterChange, onClearFilters, hasActiveFilters }: OrderFiltersProps) {
  const t = useTranslations("admin.orders")
  return (
    <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{t("filters")}</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" />
            {t("clearAll")}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("statusLabel")}</label>
          <Select value={filters.status} onValueChange={(v) => onFilterChange("status", v as FilterStatus)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="PENDING">{t("statuses.pending")}</SelectItem>
              <SelectItem value="COMPLETED">{t("statuses.completed")}</SelectItem>
              <SelectItem value="CANCELLED">{t("statuses.cancelled")}</SelectItem>
              <SelectItem value="EXPIRED">{t("statuses.expired")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("orderType")}</label>
          <Select value={filters.type} onValueChange={(v) => onFilterChange("type", v as FilterType)}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all")}</SelectItem>
              <SelectItem value="NEW_PURCHASE">{t("types.newPurchase")}</SelectItem>
              <SelectItem value="RENEWAL">{t("types.renewal")}</SelectItem>
              <SelectItem value="UPGRADE">{t("types.upgrade")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("startDate")}</label>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFilterChange("dateFrom", e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t("endDate")}</label>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFilterChange("dateTo", e.target.value)}
            className="h-9"
          />
        </div>
      </div>
    </div>
  )
}

