"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Coins } from "lucide-react"
import { api } from "@/trpc/react"
import { CreditsTable } from "@/components/admin/credits/credits-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"

export default function CreditsPage() {
  const t = useTranslations("admin.creditsManagement")
  const [search, setSearch] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const router = useRouter()

  const { data, isLoading, isFetching } = api.admin.listUsers.useQuery(
    { search: searchQuery, pageSize: 10 },
    { enabled: !!searchQuery }
  )

  const handleSearch = () => {
    if (search.trim()) {
      setSearchQuery(search.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  const handleManageClick = (user: { id: string; name: string | null }) => {
    router.push(`/admin/credits/${user.id}`)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9"
          />
        </div>
        <Button onClick={handleSearch} disabled={!search.trim() || isFetching}>
          {isFetching ? t("searching") : t("search")}
        </Button>
      </div>

      {!searchQuery && (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <Coins className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t("searchPrompt")}</p>
        </div>
      )}

      {searchQuery && (
        <CreditsTable 
          users={data?.items ?? []} 
          isLoading={isLoading} 
          onManageClick={handleManageClick} 
        />
      )}
    </div>
  )
}
