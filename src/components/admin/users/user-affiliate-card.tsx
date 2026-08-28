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
import { Users, Wallet, Clock, CheckCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { UserDetailData } from "./types";
import { useFormatter, useTranslations } from "next-intl";

interface UserAffiliateCardProps {
  user: UserDetailData;
}

export function UserAffiliateCard({ user }: UserAffiliateCardProps) {
  const t = useTranslations("admin.userManagement.affiliate");
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
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  },
                ),
              })
            : t("notActivated")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Referral Info */}
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
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
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                {user.affiliate.referredBy.email ||
                  user.affiliate.referredBy.name ||
                  t("unknown")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p>-</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">{t("payoutWallet")}</p>
            <p className="truncate font-mono text-xs">
              {user.affiliate.payoutWallet || "-"}
            </p>
          </div>
        </div>

        <Separator />

        {/* Affiliate Wallet Balances */}
        <div>
          <p className="mb-2 text-sm font-medium">{t("affiliateWallet")}</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-amber-50 p-2 text-center dark:bg-amber-950/30">
              <p className="text-lg font-bold text-amber-600">
                {formatUsd(user.affiliate.balances.pendingCents)}
              </p>
              <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {t("pending")}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-2 text-center dark:bg-green-950/30">
              <p className="text-lg font-bold text-green-600">
                {formatUsd(user.affiliate.balances.availableCents)}
              </p>
              <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
                <Wallet className="h-3 w-3" />
                {t("available")}
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 p-2 text-center dark:bg-blue-950/30">
              <p className="text-lg font-bold text-blue-600">
                {formatUsd(user.affiliate.balances.lockedCents)}
              </p>
              <p className="text-muted-foreground flex items-center justify-center gap-1 text-xs">
                <CheckCircle className="h-3 w-3" />
                {t("locked")}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <p className="text-muted-foreground text-lg font-bold">
                {formatUsd(user.affiliate.balances.debtCents)}
              </p>
              <p className="text-muted-foreground text-xs">{t("debt")}</p>
            </div>
          </div>
        </div>

        {/* Recent Payout Requests */}
        {user.affiliate.payoutRequests.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-2 text-sm font-medium">{t("recentPayouts")}</p>
              <Table>
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
                        <Badge variant="outline">
                          {req.type === "CASHOUT_USDT" ? "USDT" : t("credits")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatUsd(req.amountCents)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            req.status === "COMPLETED"
                              ? "default"
                              : req.status === "REJECTED" ||
                                  req.status === "FAILED"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-32 truncate font-mono text-xs">
                        {req.walletAddress || "-"}
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
