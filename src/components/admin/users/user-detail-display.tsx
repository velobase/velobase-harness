"use client"

import { api } from "@/trpc/react"
import type { UserDetailData } from "./types"
import { UserActionsToolbar } from "./user-actions-toolbar"
import { UserInfoCards } from "./user-info-cards"
import { UserAffiliateCard } from "./user-affiliate-card"
import { UserRelatedUsersCard } from "./user-related-users-card"

interface UserDetailDisplayProps {
  user: UserDetailData
}

export function UserDetailDisplay({ user }: UserDetailDisplayProps) {
  const { data: relatedUsers, isLoading: isLoadingRelated } = api.admin.getRelatedUsers.useQuery(
    { userId: user.id },
    { enabled: !!user.deviceKeyAtSignup }
  )

  return (
    <div className="admin-user-detail">
      {/* Status & Actions */}
      <UserActionsToolbar user={user} />

      {/* Info Cards */}
      <UserInfoCards user={user} />

      {/* Affiliate Info */}
      <UserAffiliateCard user={user} />

      {/* Related Users (Same Device) */}
      <UserRelatedUsersCard
        deviceKeyAtSignup={user.deviceKeyAtSignup}
        relatedUsers={relatedUsers}
        isLoading={isLoadingRelated}
      />
    </div>
  )
}

// Re-export types for convenience
export type { UserDetailData } from "./types"
