"use client";

import { useState } from "react";
import { useFeature } from "@/components/features/feature-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Coins,
  Copy,
  Crown,
  Wallet,
  ArrowRightLeft,
  Share2,
  User,
  History,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WithdrawDrawer } from "./withdraw-drawer";
import { ExchangeDrawer } from "./exchange-drawer";
import { CommissionHistory } from "./commission-history";
import type { RouterOutputs } from "@/trpc/react";

export type AffiliateStatus = RouterOutputs["affiliate"]["getStatus"];

interface Props {
  status: AffiliateStatus;
}

export function MobileAffiliateDashboard({ status }: Props) {
  const creditsEnabled = useFeature("credits");
  const canExchange = creditsEnabled || Boolean(status.pendingCreditExchange);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const availableUsd = (status.balances.availableCents / 100).toFixed(2);
  const pendingUsd = (status.balances.pendingCents / 100).toFixed(2);
  const minCashoutUsd = status.rules.minCashoutCents / 100;

  const progressPercent = Math.min(
    100,
    (status.balances.availableCents / status.rules.minCashoutCents) * 100,
  );

  const isCashoutReady =
    status.balances.availableCents >= status.rules.minCashoutCents;

  const copyLink = () => {
    if (status.referralLink) {
      void navigator.clipboard.writeText(status.referralLink);
      toast.success("Link copied!");
    }
  };

  const shareText = encodeURIComponent("Build with AI SaaS — join today!");
  const shareUrl = encodeURIComponent(
    status.referralLink || "https://example.com",
  );

  const twitterShareUrl = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
  const telegramShareUrl = `https://t.me/share/url?url=${shareUrl}&text=${shareText}`;

  return (
    <>
      <div className="animate-in fade-in relative flex flex-1 flex-col space-y-6 px-4 pt-4 pb-8 duration-500">
        {/* Identity Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-500">
            <Crown className="h-5 w-5 fill-current" />
            <span className="text-lg font-bold tracking-tight">
              Partner Program
            </span>
          </div>
        </div>

        {/* Hero Status */}
        <div className="bg-primary/5 text-muted-foreground border-primary/10 rounded-lg border p-3 text-sm">
          <span className="text-primary font-medium">Status: Active.</span>{" "}
          Share your link and earn 30% commission on every payment.
        </div>

        {/* Wallet Card */}
        <Card className="relative overflow-hidden border-amber-500/20 bg-gradient-to-br from-zinc-900 via-zinc-900 to-amber-950/30 shadow-xl">
          <div className="pointer-events-none absolute top-0 right-0 translate-x-1/3 -translate-y-1/2 rounded-full bg-amber-500/5 p-32 blur-3xl" />

          {/* Activity Button */}
          <div className="absolute top-3 right-3 z-20">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full border border-white/5 bg-black/20 px-2.5 text-xs text-zinc-400 backdrop-blur-sm hover:bg-black/40 hover:text-white"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="mr-1.5 h-3.5 w-3.5" />
              Transactions
            </Button>
          </div>

          <CardContent className="relative z-10 space-y-6 pt-6 pb-6">
            {/* Main Balance */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium tracking-wider text-zinc-400 uppercase">
                <Wallet className="h-3.5 w-3.5" />
                Wallet Balance
              </div>
              <div className="text-4xl font-bold tracking-tight text-white">
                ${availableUsd}
              </div>
              {status.balances.pendingCents > 0 && (
                <div className="animate-in fade-in slide-in-from-left-2 flex items-center gap-1.5 text-sm font-medium text-amber-500">
                  <Clock className="h-3.5 w-3.5" />${pendingUsd} pending
                  settlement
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Withdrawal Progress</span>
                <span>${minCashoutUsd} Minimum</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    isCashoutReady ? "bg-green-500" : "bg-amber-500",
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {!isCashoutReady && (
                <div className="text-right text-xs text-amber-500/80">
                  $
                  {(
                    (status.rules.minCashoutCents -
                      status.balances.availableCents) /
                    100
                  ).toFixed(2)}{" "}
                  more to withdraw
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                className={cn(
                  "w-full font-semibold",
                  isCashoutReady
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300",
                )}
                onClick={() => {
                  if (isCashoutReady) {
                    setWithdrawOpen(true);
                  } else {
                    const remaining =
                      (status.rules.minCashoutCents -
                        status.balances.availableCents) /
                      100;
                    toast.info(`You need $${minCashoutUsd} to withdraw.`, {
                      description: `Earn $${remaining.toFixed(2)} more to unlock cashout!`,
                      duration: 4000,
                    });
                  }
                }}
              >
                Withdraw
              </Button>
              {canExchange && (
                <>
                  <Button
                    variant="outline"
                    className="w-full border-zinc-700 bg-transparent px-2 text-zinc-300 hover:bg-white/5 hover:text-white"
                    onClick={() => setExchangeOpen(true)}
                  >
                    <Coins className="mr-1.5 h-4 w-4" />
                    Get Credits
                  </Button>
                </>
              )}
            </div>

            {/* Pending - REMOVED (moved to top) */}
          </CardContent>
        </Card>

        {/* Referral Link */}
        <div className="space-y-4">
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-bold">Your Referral Link</h2>
            <p className="text-muted-foreground text-sm">
              Earn <span className="font-bold text-amber-500">30%</span> on
              every payment.
            </p>
          </div>

          <div className="bg-muted/50 flex gap-2 rounded-xl border p-1.5">
            <div className="text-muted-foreground flex flex-1 items-center truncate px-3 font-mono text-xs select-all">
              {status.referralLink || "https://example.com?ref=..."}
            </div>
            <Button size="sm" onClick={copyLink} className="shrink-0">
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>

          {/* Social Share */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={twitterShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-black text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <XIcon className="h-4 w-4" />
              Post to X
            </a>
            <a
              href={telegramShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#229ED9] text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              <SendIcon className="h-4 w-4" />
              Share on TG
            </a>
          </div>
        </div>

        {/* How it works */}
        <div className="border-t pt-6">
          <h3 className="text-muted-foreground mb-4 text-center text-sm font-medium">
            How it works
          </h3>
          <div className="flex items-start justify-between px-2">
            <StepIcon
              icon={<Share2 className="h-5 w-5" />}
              title="Share"
              desc="Your Link"
            />
            <div className="text-muted-foreground/30 pt-3">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <StepIcon
              icon={<User className="h-5 w-5" />}
              title="Refer"
              desc="New Users"
            />
            <div className="text-muted-foreground/30 pt-3">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <StepIcon
              icon={<Coins className="h-5 w-5" />}
              title="Earn"
              desc="30% Cash"
            />
          </div>

          <p className="text-muted-foreground/60 mx-auto mt-6 max-w-[280px] text-center text-xs">
            Crypto payments are instant. Card payments settle in 30 days.
          </p>
        </div>
      </div>

      {/* Drawers */}
      <WithdrawDrawer
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        availableCents={status.balances.availableCents}
        minCashoutCents={status.rules.minCashoutCents}
        defaultWallet={status.payoutWallet}
      />
      {canExchange && (
        <>
          {" "}
          <ExchangeDrawer
            open={exchangeOpen}
            onOpenChange={setExchangeOpen}
            availableCents={status.balances.availableCents}
            exchangeUnitCents={status.rules.exchangeUnitCents}
            exchangeUnitCredits={status.rules.exchangeUnitCredits}
          />
        </>
      )}
      <CommissionHistory open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}

function StepIcon({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex w-20 flex-col items-center gap-2 text-center">
      <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full">
        {icon}
      </div>
      <div>
        <div className="text-xs font-bold">{title}</div>
        <div className="text-muted-foreground text-[10px]">{desc}</div>
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
