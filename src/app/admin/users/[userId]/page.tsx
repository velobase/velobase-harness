/* eslint-disable @next/next/no-img-element */
"use client"

import { api } from "@/trpc/react"
import { UserDetailDisplay } from "@/components/admin/users/user-detail-display"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"
import "../users.css"

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
      <div className="admin-users mx-auto max-w-[1400px] space-y-6">
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
      <div className="admin-users mx-auto max-w-[1400px] space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/users" aria-label={t("backToUsers")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-medium">{t("userNotFound")}</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-users mx-auto max-w-[1400px]">
      <Link href="/admin/users" className="users-back-link">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("backToUsers")}
      </Link>
      <div className="users-page-heading users-detail-heading">
        {user.image ? (
          <img src={user.image} alt="" className="users-avatar h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="users-avatar flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base">
            {(user.name || user.email || "?")[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="break-words">
            {user.name || t("unknownUser")}
          </h1>
          <p className="break-all">{user.email}</p>
        </div>
      </div>

      <UserDetailDisplay user={user} />
    </div>
  )
}
