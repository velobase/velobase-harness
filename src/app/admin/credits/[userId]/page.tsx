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
      <div className="admin-module-page space-y-6">
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
      <div className="admin-module-page space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/credits">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-destructive">{t("userNotFound")}</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-module-page space-y-6">
      <div className="flex items-center gap-4">
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
      />
    </div>
  )
}
