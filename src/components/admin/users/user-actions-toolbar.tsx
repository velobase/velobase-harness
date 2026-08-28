"use client";

import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Shield,
  ShieldOff,
  Smartphone,
  CreditCard,
  Coins,
  Ban,
  CheckCircle,
  Trash2,
  Film,
  ShoppingCart,
  Timer,
  Eye,
  EyeOff,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserDetailData } from "./types";
import { useTranslations } from "next-intl";

interface UserActionsToolbarProps {
  user: UserDetailData;
}

export function UserActionsToolbar({ user }: UserActionsToolbarProps) {
  const t = useTranslations("admin.userManagement");
  const router = useRouter();
  const utils = api.useUtils();

  const blockMutation = api.admin.blockUser.useMutation({
    onSuccess: () => {
      void utils.admin.getUser.invalidate({ userId: user.id });
      router.refresh();
    },
  });

  const unblockMutation = api.admin.unblockUser.useMutation({
    onSuccess: () => {
      void utils.admin.getUser.invalidate({ userId: user.id });
      router.refresh();
    },
  });

  const deleteMutation = api.admin.deleteUser.useMutation({
    onSuccess: () => {
      router.push("/admin/users");
    },
  });

  const resetOfferMutation = api.admin.resetNewUserOffer.useMutation({
    onSuccess: () => {
      void utils.admin.getUser.invalidate({ userId: user.id });
      router.refresh();
    },
  });

  const setBlurBypassMutation = api.admin.setBlurBypass.useMutation({
    onSuccess: () => {
      void utils.admin.getUser.invalidate({ userId: user.id });
      router.refresh();
    },
  });

  const canBypassBlur = user.stats?.canBypassBlur ?? false;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Status Badges */}
      <div className="flex flex-wrap items-center gap-2">
        {user.isBlocked ? (
          <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" />
            {t("blocked")}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            {t("active")}
          </Badge>
        )}
        {user.isAdmin && (
          <Badge variant="default" className="gap-1">
            <Shield className="h-3 w-3" />
            {t("admin")}
          </Badge>
        )}
        {user.hasPurchased && (
          <Badge variant="secondary" className="gap-1">
            <CreditCard className="h-3 w-3" />
            {t("actionsToolbar.paidUser")}
          </Badge>
        )}
        {!user.isPrimaryDeviceAccount && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500 text-amber-600"
          >
            <Smartphone className="h-3 w-3" />
            {t("actionsToolbar.secondaryAccount")}
          </Badge>
        )}
        {canBypassBlur && (
          <Badge
            variant="outline"
            className="gap-1 border-green-500 text-green-600"
          >
            <Eye className="h-3 w-3" />
            {t("actionsToolbar.blurBypass")}
          </Badge>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary Actions - Always visible */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/works?userId=${user.id}`}>
            <Film className="mr-2 h-4 w-4" />
            {t("actionsToolbar.works")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/orders/${user.id}`}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t("actionsToolbar.orders")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/credits/${user.id}`}>
            <Coins className="mr-2 h-4 w-4" />
            {t("actionsToolbar.credits")}
          </Link>
        </Button>

        {/* More Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Blur Bypass Toggle */}
            <DropdownMenuItem
              onClick={() =>
                setBlurBypassMutation.mutate({
                  userId: user.id,
                  enabled: !canBypassBlur,
                })
              }
              disabled={setBlurBypassMutation.isPending}
            >
              {canBypassBlur ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  {t("actionsToolbar.removeBlurBypass")}
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  {t("actionsToolbar.enableBlurBypass")}
                </>
              )}
            </DropdownMenuItem>

            {/* Reset Offer */}
            <DropdownMenuItem
              onClick={() => resetOfferMutation.mutate({ userId: user.id })}
              disabled={resetOfferMutation.isPending}
            >
              <Timer className="mr-2 h-4 w-4" />
              {t("actionsToolbar.resetOffer")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Block/Unblock */}
            {user.isBlocked ? (
              <DropdownMenuItem
                onClick={() => unblockMutation.mutate({ userId: user.id })}
                disabled={unblockMutation.isPending}
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                {t("actionsToolbar.unblockUser")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => blockMutation.mutate({ userId: user.id })}
                disabled={blockMutation.isPending}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="mr-2 h-4 w-4" />
                {t("actionsToolbar.blockUser")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete Button - Requires confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={deleteMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("actionsToolbar.deleteUser")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("actionsToolbar.deleteDescription", {
                  email: user.email ?? "",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("actionsToolbar.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate({ userId: user.id })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("actionsToolbar.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
