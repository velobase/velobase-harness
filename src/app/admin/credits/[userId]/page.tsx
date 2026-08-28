"use client"

import { api } from "@/trpc/react"
import { UserCreditsDisplay } from "@/components/admin/credits/user-credits-display"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"

export default function CreditDetailsPage() {
  const t = useTranslations("admin.creditsManagement")
  const params = useParams()
  const userId = params.userId as string

  const { data: user, isLoading } = api.admin.getUser.useQuery({ userId }, {
    enabled: !!userId
  })

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/credits">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-red-500">{t("userNotFound")}</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/credits">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {user.name || t("unknownUser")}
            <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {user.isAdmin ? t("adminRole") : t("userRole")}
            </span>
          </h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <UserCreditsDisplay 
        userId={userId} 
        userName={user.name} 
        // We can optimize UserCreditsDisplay to not show the user header again since we show it on top page level
        // But currently UserCreditsDisplay has the Grant button in its header. 
        // Let's keep it as is for now, maybe hide the user info part in UserCreditsDisplay if we want to be cleaner?
        // UserCreditsDisplay header: [Avatar + Name/ID] [Grant Button]
        // Page header: [Back] [Name + Email]
        // It's a bit redundant.
        // Let's hide the user info in UserCreditsDisplay via className or props if needed.
        // Actually, UserCreditsDisplay design is self-contained. 
        // Let's modify UserCreditsDisplay to accept a prop to hide header info?
        // Or just let it be. The UserCreditsDisplay header has the Grant button.
        // The page header is for navigation context.
      />
    </div>
  )
}
