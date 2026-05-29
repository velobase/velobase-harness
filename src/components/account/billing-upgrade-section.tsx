'use client';

import { useState } from 'react';
import { BillingIntervalToggle } from '@/components/pricing/billing-interval-toggle';
import { SubscriptionCard } from '@/components/pricing/subscription-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthStore } from '@/components/auth/store/auth-store';
import { Button } from '@/components/ui/button';
import { useSubscriptionProducts } from '@/hooks/use-pricing-products';
import { supportMailto } from '@/config/brand';

type BillingInterval = 'MONTH' | 'YEAR';

interface BillingUpgradeSectionProps {
  userTier?: 'FREE' | 'STARTER' | 'PLUS' | 'PREMIUM';
}

export function BillingUpgradeSection({ userTier }: BillingUpgradeSectionProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('YEAR');
  const { setLoginModalOpen } = useAuthStore();

  // 使用统一的订阅产品 hook（自动处理 AB 测试变体过滤）
  const { products: allSubscriptions, isLoading: subscriptionsLoading } = useSubscriptionProducts();

  // 按 interval 过滤（变体过滤已在 hook 里完成）
  const subscriptions = allSubscriptions.filter((p) => {
    const productInterval = p.interval?.toLowerCase();
    const selectedInterval = billingInterval === 'MONTH' ? 'month' : 'year';
    // Always show free plan regardless of interval
    return productInterval === selectedInterval || p.price === 0;
  });

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            Upgrade your plan
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Get more access to the best AI models
          </p>
        </div>
        
        {/* Billing Interval Toggle */}
        <BillingIntervalToggle
          value={billingInterval}
          onChange={setBillingInterval}
        />
      </div>

      {/* Subscription Cards Grid */}
      {subscriptionsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-[540px] rounded-2xl" />
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-12 border rounded-2xl bg-slate-50 dark:bg-slate-900/40">
          <p className="text-slate-500 dark:text-slate-400">
            No subscription plans available
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subscriptions.map((product) => (
            <SubscriptionCard
              key={product.id}
              product={product}
              billingInterval={billingInterval}
              userTier={userTier}
              onRequireLogin={() => setLoginModalOpen(true, undefined, "header")}
            />
          ))}
        </div>
      )}

      {/* Enterprise Section */}
      <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Enterprise
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Built for larger organizations who want to scale with confidence.
              We offer custom apps, advanced security, priority support, standard legal agreement, and more.
            </p>
          </div>
          <Button variant="outline" className="flex-shrink-0" asChild>
            <a href={supportMailto()}>Contact Sales</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
