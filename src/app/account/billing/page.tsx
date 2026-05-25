import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import { api } from '@/trpc/server';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/site-footer';
import { Background } from '@/components/layout/background';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Coins, Zap, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RedeemCodeDialog } from '@/components/account/redeem-code-dialog';
import { SubscriptionModal } from '@/components/account/subscription-modal';
import { TrialUnlockButton } from '@/components/billing/trial-unlock-button';
import { BillingCreditsSection } from '@/components/billing/billing-credits-section';
import { BillingActivitySection } from '@/components/billing/billing-activity-section';

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect('/api/auth/signin?callbackUrl=%2Faccount%2Fbilling');
  }

  const userId = session.user.id;

  // Parallel fetch: status, balance, usage, subscriptions, credits packages
  const [billingStatus, balance, usage, subscriptionData, creditsData] = await Promise.all([
    api.account.getBillingStatus(),
    api.billing.getBalance({ userId }),
    api.billing.getRecords({ userId, limit: 5 }),
    api.product.listForPricing({ type: 'SUBSCRIPTION', limit: 10 }),
    api.product.listForPricing({ type: 'CREDITS_PACKAGE', limit: 20 }),
  ]);
  
  // Find the $9.99 starter pack (price = 999 cents)
  const starterPack = creditsData?.products?.find(p => p.price === 999) ?? creditsData?.products?.[0];

  const tier = billingStatus.tier; // 'FREE' | 'STARTER' | 'PLUS' | 'PREMIUM'
  const subscriptionStatus = billingStatus.subscriptionStatus; // 'NONE' | ...
  const subscriptionTier = billingStatus.subscriptionTier; // 'STARTER' | 'PLUS' | 'PREMIUM' | null
  const cancelAtPeriodEnd = billingStatus.cancelAtPeriodEnd;

  const hasSubscriptionRelationship = subscriptionStatus !== 'NONE';
  const hasActiveEntitlement = tier !== 'FREE';
  const isSubscribed = hasSubscriptionRelationship; // for UI actions like "Manage Subscription"
  const isPro = tier === 'PLUS' || tier === 'PREMIUM';
  const creditsAvailable = balance.totalSummary.available;
  const isTrial = billingStatus.cycleType === 'TRIAL';

  const isRenewing = hasSubscriptionRelationship && !hasActiveEntitlement && subscriptionStatus === 'ACTIVE';
  const hasPaymentIssue =
    hasSubscriptionRelationship && (subscriptionStatus === 'PAST_DUE' || subscriptionStatus === 'UNPAID');

  let trialEndLabel: string | null = null;
  if (isTrial && billingStatus.trialEndsAt) {
    const end = new Date(billingStatus.trialEndsAt);
    if (!Number.isNaN(end.getTime())) {
      trialEndLabel = end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  }
  
  // Filter for subscription products
  // We need both monthly and yearly variants for the modal
  const subscriptionProducts = subscriptionData?.products?.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    displayPrice: p.displayPrice,
    yearlyDisplayPrice: p.yearlyDisplayPrice,  // "Billed £276.00 yearly"
    price: p.price,
    interval: p.interval || 'month', // DB stores 'WEEK'/'MONTH'/'YEAR' (or legacy lowercase)
    planType: p.planType,
  })) ?? [];

  // Prefer showing PLUS as the upgrade target; fallback to any paid non-free plan.
  const upgradeProducts = subscriptionProducts.filter(
    (p) => p.price > 0 && (p.planType === 'PLUS' || p.planType === 'PREMIUM')
  );
  const displayUpgradePlan =
    upgradeProducts.find((p) => (p.interval ?? '').toString().toLowerCase() === 'month') ??
    upgradeProducts[0] ??
    subscriptionProducts.find((p) => p.price > 0) ??
    null;

  return (
    <div className="min-h-screen w-full bg-background text-foreground relative font-sans selection:bg-primary/30">
      <Background />
      <Header />

      <main className="relative z-10 flex flex-col items-center w-full px-4 pt-28 pb-20">
        <div className="w-full max-w-3xl space-y-10">

          {/* Section 1: Status Dashboard (Minimalist) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Plan Status */}
            <Card className="border-border/40 bg-card/40 backdrop-blur-md shadow-sm">
              <CardContent className="p-6 flex flex-col justify-between h-full min-h-[140px]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Current Plan</p>
                    <div className="mt-2 flex items-center gap-2">
                      <h2 className="text-2xl font-bold tracking-tight">
                        {hasSubscriptionRelationship
                          ? subscriptionTier === 'PREMIUM'
                            ? 'Premium Plan'
                            : subscriptionTier === 'STARTER'
                              ? 'Starter Plan'
                              : subscriptionTier === 'PLUS'
                                ? 'Pro Plan'
                                : 'Subscription'
                          : 'Free Plan'}
                      </h2>
                      {isSubscribed && (
                        <Badge
                          variant={isTrial || isRenewing || hasPaymentIssue ? 'outline' : 'default'}
                          className={
                            isTrial
                              ? 'border-orange-500/40 text-orange-600 bg-orange-500/5'
                              : hasPaymentIssue
                                ? 'border-red-500/40 text-red-600 bg-red-500/5'
                                : isRenewing
                                  ? 'border-slate-500/40 text-slate-700 dark:text-slate-300 bg-slate-500/5'
                              : subscriptionTier === 'PREMIUM'
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 border-0 text-white'
                              : subscriptionTier === 'STARTER'
                              ? 'bg-gradient-to-r from-yellow-500 to-orange-500 border-0 text-white'
                              : subscriptionTier === 'PLUS'
                                ? 'bg-gradient-to-r from-orange-500 to-red-600 border-0 text-white'
                                : 'border-slate-500/40 text-slate-700 dark:text-slate-300 bg-slate-500/5'
                          }
                        >
                          {isTrial
                            ? 'TRIAL'
                            : hasPaymentIssue
                              ? 'PAYMENT ISSUE'
                              : isRenewing
                                ? 'RENEWING'
                                : subscriptionTier === 'PREMIUM'
                                  ? 'PREMIUM'
                                  : subscriptionTier === 'STARTER'
                                    ? 'STARTER'
                                    : subscriptionTier === 'PLUS'
                                      ? 'PRO'
                                      : 'SUBSCRIPTION'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-2 rounded-full bg-muted/50">
                    <Zap className={cn("w-5 h-5", isPro ? "text-orange-500" : "text-muted-foreground")} />
            </div>
                </div>
                <div className="mt-4 space-y-2">
                  {isTrial && trialEndLabel && (
                    <div className="flex flex-col gap-1">
                      <p className="text-xs text-muted-foreground">
                        Free trial active — ends on{' '}
                        <span className="font-semibold">{trialEndLabel}</span>.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <TrialUnlockButton size="sm">
                          Unlock Pro Now (30,000 credits)
                        </TrialUnlockButton>
                        <span className="text-[11px] text-muted-foreground">
                          Subscriptions are temporarily unavailable.
                        </span>
                      </div>
                    </div>
                  )}
                  {hasPaymentIssue && (
                    <p className="text-xs text-muted-foreground">
                      Your renewal payment didn&apos;t go through. Please update your payment method to keep access.
                    </p>
                  )}
                  {isRenewing && (
                    <p className="text-xs text-muted-foreground">
                      Your renewal is processing. This can take a short time — please refresh in a few minutes.
                    </p>
                  )}
                  {cancelAtPeriodEnd && hasSubscriptionRelationship && (
                    <p className="text-xs text-muted-foreground">
                      Your subscription is set to cancel at the end of the current period.
                    </p>
                  )}
                  {isSubscribed ? (
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link href="/account/manage-subscription">
                          Manage Subscription
                        </Link>
                      </Button>

                      {/* Subscription upgrades are temporarily disabled. */}
                      {!isPro && upgradeProducts.length > 0 && (
                        <SubscriptionModal products={upgradeProducts}>
                          <Button variant="outline" size="sm" className="w-full group" disabled>
                            Upgrade Plan
                            <Zap className="w-3.5 h-3.5 ml-2 text-orange-500 group-hover:scale-110 transition-transform" />
                          </Button>
                        </SubscriptionModal>
                      )}
                    </div>
                  ) : (
                    <SubscriptionModal products={upgradeProducts.length > 0 ? upgradeProducts : subscriptionProducts}>
                      <Button variant="outline" size="sm" className="w-full group" disabled>
                        Upgrade Plan
                        <Zap className="w-3.5 h-3.5 ml-2 text-orange-500 group-hover:scale-110 transition-transform" />
                      </Button>
                    </SubscriptionModal>
                  )}
                </div>
            </CardContent>
          </Card>

            {/* Right: Credits Balance */}
            <Card className="border-border/40 bg-card/40 backdrop-blur-md shadow-sm">
              <CardContent className="p-6 flex flex-col justify-between h-full min-h-[140px]">
                <div className="flex items-start justify-between">
              <div>
                    <p className="text-sm font-medium text-muted-foreground">Available Credits</p>
                    <div className="mt-2">
                      <h2 className="text-3xl font-bold tracking-tight tabular-nums">
                        {creditsAvailable.toLocaleString()}
                      </h2>
                    </div>
                  </div>
                  <div className="p-2 rounded-full bg-muted/50">
                    <Coins className="w-5 h-5 text-yellow-500" />
                  </div>
              </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className="flex-1" asChild>
                  <Link href="/pricing#credits">Buy Credits</Link>
                </Button>
                  <RedeemCodeDialog />
            </div>
          </CardContent>
        </Card>
          </div>

          {/* Section 2: Upgrade CTA (For non-Pro users) */}
          {!isPro && displayUpgradePlan && (() => {
            // Extract features from product description
            const features = displayUpgradePlan.description && 
              typeof displayUpgradePlan.description === 'object' && 
              'features' in displayUpgradePlan.description &&
              Array.isArray((displayUpgradePlan.description as {features?: unknown}).features)
                ? (displayUpgradePlan.description as {features: string[]}).features
                : [];
            
            return (
              <div className="relative group rounded-2xl overflow-hidden border border-orange-500/20 bg-gradient-to-b from-orange-50/50 to-background dark:from-orange-950/10 dark:to-background p-1 transition-all hover:border-orange-500/40">
                <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] -z-10" />
                <div className="px-6 py-8 md:px-10 md:py-10 flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="space-y-4 flex-1">
                    <Badge variant="outline" className="border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-500/5">
                      Recommended
                    </Badge>
                    <h3 className="text-2xl md:text-3xl font-bold tracking-tight">
                      Upgrade to Pro
                    </h3>
                    <div className="space-y-2">
                      {features.slice(0, 4).map((feature, i) => (
                        <FeatureItem key={i}>{feature}</FeatureItem>
                      ))}
              </div>
            </div>
                  
                  <div className="flex flex-col items-center gap-3 min-w-[200px]">
                    <div className="text-center">
                      <span className="text-3xl font-bold">{displayUpgradePlan.displayPrice}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <SubscriptionModal products={upgradeProducts.length > 0 ? upgradeProducts : subscriptionProducts}>
                      <Button size="lg" className="w-full bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-500/20">
                        Upgrade Now
                      </Button>
                    </SubscriptionModal>
                    <p className="text-xs text-muted-foreground text-center">
                      Cancel anytime
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Section 3: Buy Credits */}
          {starterPack && (
            <BillingCreditsSection starterPack={starterPack} />
          )}

          {/* Section 4: Recent Activity (Collapsible) */}
          <BillingActivitySection records={usage.records} />

      </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
        <Check className="h-3 w-3" />
      </div>
      <span>{children}</span>
    </div>
  );
}
