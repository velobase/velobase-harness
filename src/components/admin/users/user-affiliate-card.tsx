"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { UserDetailData } from "./types";
import { useFormatter, useTranslations } from "next-intl";

interface UserAffiliateCardProps {
  user: UserDetailData;
}

export function UserAffiliateCard({ user }: UserAffiliateCardProps) {
  const t = useTranslations("admin.userManagement.affiliate");
  const payouts = useTranslations("admin.affiliatePayouts");
  const format = useFormatter();
  const formatUsd = (amountCents: number) =>
    format.number(amountCents / 100, { style: "currency", currency: "USD" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>
          {user.affiliate.affiliateEnabledAt
            ? t("enabledAt", {
                date: format.dateTime(
                  new Date(user.affiliate.affiliateEnabledAt),
                  {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  },
                ),
              })
            : t("notActivated")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Referral Info */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">{t("referralCode")}</p>
            <p className="font-mono">{user.affiliate.referralCode || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("referrals")}</p>
            <p className="font-medium">
              {format.number(user.affiliate.referralsCount)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("referredBy")}</p>
            {user.affiliate.referredBy ? (
              <Link
                href={`/admin/users/${user.affiliate.referredBy.id}`}
                className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
              >
                {user.affiliate.referredBy.email ||
                  user.affiliate.referredBy.name ||
                  t("unknown")}
                <ArrowRight className="h-3 w-3 shrink-0" />
              </Link>
            ) : (
              <p>-</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">{t("payoutWallet")}</p>
            <p className="truncate font-mono text-xs" title={user.affiliate.payoutWallet || undefined}>
              {user.affiliate.payoutWallet || "-"}
            </p>
          </div>
        </div>

        <Separator />

        {/* Affiliate Wallet Balances */}
        <div>
          <p className="mb-2 text-sm font-medium">{t("affiliateWallet")}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 xl:grid-cols-4">
            <div>
              <p className="whitespace-nowrap text-xl font-medium tabular-nums">
                {formatUsd(user.affiliate.balances.pendingCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("pending")}
              </p>
            </div>
            <div>
              <p className="whitespace-nowrap text-xl font-medium tabular-nums">
                {formatUsd(user.affiliate.balances.availableCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("available")}
              </p>
            </div>
            <div>
              <p className="whitespace-nowrap text-xl font-medium tabular-nums">
                {formatUsd(user.affiliate.balances.lockedCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("locked")}
              </p>
            </div>
            <div>
              <p className="whitespace-nowrap text-xl font-medium tabular-nums">
                {formatUsd(user.affiliate.balances.debtCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("debt")}</p>
            </div>
          </div>
        </div>

        {/* Recent Payout Requests */}
        {user.affiliate.payoutRequests.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">{t("recentPayouts")}</p>
              <Table className="min-w-[560px] whitespace-nowrap">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("type")}</TableHead>
                    <TableHead>{t("amount")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("wallet")}</TableHead>
                    <TableHead>{t("time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.affiliate.payoutRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        {req.type === "CASHOUT_USDT" ? "USDT" : t("credits")}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatUsd(req.amountCents)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.status === "COMPLETED"
                              ? "secondary"
                              : req.status === "REJECTED" ||
                                  req.status === "FAILED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {payouts.has(`statuses.${req.status.toLowerCase()}`)
                            ? payouts(`statuses.${req.status.toLowerCase()}`)
                            : req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className="block max-w-32 truncate" title={req.walletAddress || undefined}>
                          {req.walletAddress || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format.dateTime(new Date(req.createdAt), {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
