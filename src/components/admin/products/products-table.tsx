"use client"

import { api } from "@/trpc/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useState, useCallback } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { useFormatter, useTranslations } from "next-intl"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Filter,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ProductListFilter, defaultFilters, type ProductFilters } from "./product-list-filter"
import { ProductListTable } from "./product-list-table"
import { ProductDetailSheet } from "./product-detail-sheet"
import type { RouterOutputs } from "@/trpc/react"

type Product = RouterOutputs["admin"]["listProducts"]["items"][number]

export function ProductsTable() {
  const t = useTranslations("admin.productManagement")
  const format = useFormatter()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters)
  const [showFilters, setShowFilters] = useState(false)
  
  // Detail Sheet State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const debouncedSearch = useDebounce(search, 500)

  const utils = api.useUtils()

  const { data, isLoading } = api.admin.listProducts.useQuery({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    type: filters.type,
    status: filters.status,
    isAvailable: filters.isAvailable,
  })

  const toggleAvailability = api.admin.toggleProductAvailability.useMutation({
    onSuccess: () => {
      void utils.admin.listProducts.invalidate()
      // Refresh detail if open
      if (selectedProduct) {
         void utils.admin.getProduct.invalidate({ productId: selectedProduct.id })
      }
    },
  })

  // Airwallex sync removed — only Stripe + NowPayments supported

  const updateFilter = useCallback(<K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters)
    setPage(1)
  }, [])

  const hasActiveFilters = Object.entries(filters).some(([, value]) => value !== "all")

  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0
  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)

  const handleViewDetail = (product: Product) => {
    setSelectedProduct(product)
    setIsDetailOpen(true)
  }

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {total > 0 ? t("subtitleTotal", { count: total }) : t("subtitleEmpty")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
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
        <ProductListFilter 
          filters={filters}
          onChange={updateFilter}
          onClear={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      {/* Table */}
      <ProductListTable
        isLoading={isLoading}
        products={data?.items ?? []}
        pageSize={pageSize}
        onToggleAvailability={(id) => toggleAvailability.mutate({ productId: id })}
        isToggling={toggleAvailability.isPending}
        onViewDetail={handleViewDetail}
      />

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("perPage")}</span>
          <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
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
          <span className="text-sm text-muted-foreground">
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
            <span className="text-sm w-20 text-center">
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

      {/* Detail Sheet */}
      <ProductDetailSheet
        product={selectedProduct}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onUpdate={() => utils.admin.listProducts.invalidate()}
      />
    </div>
  )
}
