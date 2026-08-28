/* eslint-disable @next/next/no-img-element */
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
  User,
  Smartphone,
  Globe,
  CreditCard,
  CheckCircle,
  DollarSign,
  MousePointerClick,
  Mail,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import type { UserDetailData } from "./types";
import { useFormatter, useTranslations } from "next-intl";

interface UserInfoCardsProps {
  user: UserDetailData;
}

export function UserInfoCards({ user }: UserInfoCardsProps) {
  const t = useTranslations("admin.userManagement");
  const format = useFormatter();
  const formatDateTime = (date: Date | string) =>
    format.dateTime(new Date(date), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const hasUtm = user.utmSource || user.utmMedium || user.utmCampaign;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {t("info.basicInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            {user.image ? (
              <img src={user.image} alt="" className="h-12 w-12 rounded-full" />
            ) : (
              <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                <User className="text-muted-foreground h-6 w-6" />
              </div>
            )}
            <div>
              <p className="font-medium">{user.name || t("info.noName")}</p>
              <p className="text-muted-foreground text-sm">{user.email}</p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">
                {t("info.canonicalEmail")}
              </p>
              <p className="font-mono text-xs">{user.canonicalEmail || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("info.userId")}</p>
              <p className="truncate font-mono text-xs">{user.id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("info.joined")}</p>
              <p>{formatDateTime(user.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Device & Security Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            {t("info.deviceSecurity")}
          </CardTitle>
          <CardDescription>{t("info.antiAbuseTracking")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">{t("info.signupIp")}</p>
              <p className="font-mono text-xs">{user.signupIp || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">
                {t("info.primaryAccount")}
              </p>
              <p>
                {user.isPrimaryDeviceAccount ? (
                  <Badge variant="default">{t("yes")}</Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500 text-amber-600"
                  >
                    {t("info.secondary")}
                  </Badge>
                )}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground">{t("info.deviceKey")}</p>
              <p className="font-mono text-xs break-all">
                {user.deviceKeyAtSignup || t("info.notRecorded")}
              </p>
            </div>
            {user.stripeCustomerId && (
              <div className="col-span-2">
                <p className="text-muted-foreground">
                  {t("info.stripeCustomer")}
                </p>
                <a
                  href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
                >
                  {user.stripeCustomerId}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* UTM Attribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            {t("info.utmAttribution")}
          </CardTitle>
          <CardDescription>{t("info.utmDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {hasUtm ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">{t("info.source")}</p>
                <p>{user.utmSource || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("info.medium")}</p>
                <p>{user.utmMedium || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("info.campaign")}</p>
                <p>{user.utmCampaign || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("info.term")}</p>
                <p>{user.utmTerm || "-"}</p>
              </div>
              {user.utmContent && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">{t("info.content")}</p>
                  <p>{user.utmContent}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("info.noUtm")}</p>
          )}
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            {t("info.subscription")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.subscription ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {user.subscription.planSnapshot.name ||
                      t("info.unknownPlan")}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {user.subscription.planSnapshot.type}
                  </p>
                </div>
                <Badge
                  variant={
                    user.subscription.status === "ACTIVE"
                      ? "default"
                      : "secondary"
                  }
                >
                  {user.subscription.status}
                </Badge>
              </div>
              {user.subscription.currentCycle && (
                <div className="text-sm">
                  <p className="text-muted-foreground">
                    {t("info.currentPeriod")}
                  </p>
                  <p>
                    {formatDateTime(user.subscription.currentCycle.startsAt)} -{" "}
                    {formatDateTime(user.subscription.currentCycle.expiresAt)}
                  </p>
                </div>
              )}
              {user.subscription.cancelAtPeriodEnd && (
                <Badge
                  variant="outline"
                  className="border-amber-500 text-amber-600"
                >
                  {t("info.cancelsAtPeriodEnd")}
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("info.noActiveSubscription")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* User Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t("info.userStats")}
          </CardTitle>
          <CardDescription>{t("info.lifetimeValueUsage")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-600">
                {format.number((user.stats?.totalPaidCents ?? 0) / 100, {
                  style: "currency",
                  currency: "USD",
                })}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("info.totalPaidLtv")}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">
                {format.number(user.stats?.ordersCount ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("info.orders")}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">
                {format.number(user.stats?.hitPaywallCount ?? 0)}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("info.paywallHits")}
              </p>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">{t("info.proTrialUsed")}</p>
              <p>
                {user.stats?.hasUsedProTrial ? (
                  <Badge>{t("yes")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("no")}</Badge>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">
                {t("info.trialConverted")}
              </p>
              <p>
                {user.stats?.proTrialConverted ? (
                  <Badge variant="default">{t("yes")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("no")}</Badge>
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">
                {t("info.hitPaywallCount")}
              </p>
              <p className="font-medium">
                {format.number(user.stats?.hitPaywallCount ?? 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ad Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4" />
            {t("info.adTracking")}
          </CardTitle>
          <CardDescription>{t("info.adTrackingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {user.adClickId ? (
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">{t("info.clickId")}</p>
                <p className="font-mono text-xs break-all">{user.adClickId}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">{t("info.provider")}</p>
                  <p>{user.adClickProvider || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t("info.clickTime")}</p>
                  <p>
                    {user.adClickTime ? formatDateTime(user.adClickTime) : "-"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {t("info.noAdClick")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Email Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {t("info.emailStatus")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {user.emailBounced ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t("info.bounced")}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t("info.notBounced")}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {user.emailComplained ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t("info.complained")}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {t("info.noComplaints")}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
