"use client"

import { api } from "@/trpc/react"
import { UserDetailDisplay } from "@/components/admin/users/user-detail-display"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"

export default function UserDetailPage() {
  const t = useTranslations("admin.userManagement")
  const params = useParams()
  const userId = params.userId as string

  const { data: user, isLoading } = api.admin.getUser.useQuery(
    { userId },
    { enabled: !!userId }
  )

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
            <Link href="/admin/users">
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
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {user.name || t("unknownUser")}
          </h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <UserDetailDisplay user={user} />
    </div>
  )
}
