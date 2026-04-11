"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  MessageSquare,
  CreditCard,
  Coins,
  Tag,
  User,
  Settings,
  FolderOpen,
  Store,
  Compass,
  ShieldCheck,
  FileText,
  BookOpen,
  HelpCircle,
  Users,
  Wallet,
  Zap,
  Lock,
  Unlock,
  FlaskConical,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Background } from "@/components/layout/background";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
}

const mainFeatures: NavItem[] = [
  {
    title: "AI Chat",
    href: "/chat",
    icon: MessageSquare,
    description: "Multi-agent AI chat with tool use",
  },
  {
    title: "Projects",
    href: "/projects",
    icon: FolderOpen,
    description: "Manage your projects and documents",
  },
  {
    title: "Marketplace",
    href: "/marketplace",
    icon: Store,
    description: "Browse and install AI agents",
  },
  {
    title: "Explorer",
    href: "/explorer",
    icon: Compass,
    description: "Explore community content",
  },
];

const accountPages: NavItem[] = [
  {
    title: "Profile",
    href: "/account/profile",
    icon: User,
    description: "Manage your profile",
  },
  {
    title: "Billing",
    href: "/account/billing",
    icon: CreditCard,
    description: "Subscription & payment history",
  },
  {
    title: "Credits",
    href: "/pricing#credits",
    icon: Coins,
    description: "Buy credit packs",
  },
  {
    title: "Settings",
    href: "/account/settings",
    icon: Settings,
    description: "Account settings",
  },
  {
    title: "Affiliate",
    href: "/account/affiliate",
    icon: Users,
    description: "Referral program (30% commission)",
  },
];

const otherPages: NavItem[] = [
  {
    title: "Pricing",
    href: "/pricing",
    icon: Tag,
    description: "Plans and pricing",
  },
  {
    title: "Docs",
    href: "/docs",
    icon: BookOpen,
    description: "Documentation",
  },
  {
    title: "Support",
    href: "/support",
    icon: HelpCircle,
    description: "Get help",
  },
  {
    title: "Blog",
    href: "/blog",
    icon: FileText,
    description: "Latest news and updates",
  },
];

const adminPages: NavItem[] = [
  {
    title: "Admin Dashboard",
    href: "/admin",
    icon: ShieldCheck,
    description: "Users, orders, products, promos",
    badge: "Admin",
  },
];

function PageCard({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-start gap-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-4",
        "hover:bg-accent/50 hover:border-border hover:shadow-md transition-all duration-200",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
        <item.icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm text-foreground group-hover:text-foreground">
            {item.title}
          </h3>
          {item.badge && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500 border border-orange-500/20">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
      </div>
    </Link>
  );
}

function PageSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item) => (
          <PageCard key={item.href} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="min-h-screen w-full bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin ?? false;

  return (
    <div className="min-h-dvh w-full bg-background text-foreground font-sans relative overflow-x-hidden">
      <Background />
      <Header />

      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Welcome back{session.user.name ? `, ${session.user.name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose where you want to go.
          </p>
        </div>

        <div className="space-y-8">
          <PageSection title="Core Features" items={mainFeatures} />
          <PageSection title="Account" items={accountPages} />
          <PageSection title="Resources" items={otherPages} />
          {isAdmin && <PageSection title="Administration" items={adminPages} />}

          <BillingTestPanel userId={session.user.id} />
        </div>
      </main>
    </div>
  );
}

function BillingTestPanel({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const balanceQuery = api.billing.getBalance.useQuery({ userId });
  const freezeMutation = api.billing.freeze.useMutation();
  const consumeMutation = api.billing.consume.useMutation();
  const unfreezeMutation = api.billing.unfreeze.useMutation();
  const deductMutation = api.billing.postConsume.useMutation();

  const log = useCallback((msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));
  }, []);

  const refetch = () => void balanceQuery.refetch();

  const handleDirectDeduct = async () => {
    const txId = `test_deduct_${userId}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    log(`Deduct: transactionId=${txId}, amount=10`);
    try {
      const res = await deductMutation.mutateAsync({
        userId,
        amount: 10,
        businessId: txId,
        businessType: "TASK",
        description: "Dashboard test: direct deduct",
      });
      log(`Deduct OK: charged ${res.totalAmount} credits`);
      toast.success(`Deducted ${res.totalAmount} credits`);
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log(`Deduct FAILED: ${msg}`);
      toast.error(msg);
    }
  };

  const handleFreezeConsume = async () => {
    const txId = `test_fc_${userId}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    log(`Freeze+Consume: transactionId=${txId}, amount=15`);
    try {
      const freezeRes = await freezeMutation.mutateAsync({
        userId,
        accountType: "CREDIT",
        businessId: txId,
        businessType: "TASK",
        amount: 15,
        description: "Dashboard test: freeze",
      });
      log(`Freeze OK: frozen ${freezeRes.totalAmount} credits`);
      refetch();

      const consumeRes = await consumeMutation.mutateAsync({
        businessId: txId,
        actualAmount: 8,
      });
      log(`Consume OK: charged ${consumeRes.totalAmount}, returned ${consumeRes.returnedAmount ?? 0}`);
      toast.success(`Frozen 15 → consumed 8, returned 7`);
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log(`Freeze+Consume FAILED: ${msg}`);
      toast.error(msg);
    }
  };

  const handleFreezeUnfreeze = async () => {
    const txId = `test_fu_${userId}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    log(`Freeze+Unfreeze: transactionId=${txId}, amount=20`);
    try {
      const freezeRes = await freezeMutation.mutateAsync({
        userId,
        accountType: "CREDIT",
        businessId: txId,
        businessType: "TASK",
        amount: 20,
        description: "Dashboard test: freeze then unfreeze",
      });
      log(`Freeze OK: frozen ${freezeRes.totalAmount} credits`);
      refetch();

      const unfreezeRes = await unfreezeMutation.mutateAsync({ businessId: txId });
      log(`Unfreeze OK: returned ${unfreezeRes.totalAmount} credits`);
      toast.success(`Frozen 20 → unfrozen 20, balance restored`);
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      log(`Freeze+Unfreeze FAILED: ${msg}`);
      toast.error(msg);
    }
  };

  const available = balanceQuery.data?.totalSummary.available ?? 0;
  const frozen = balanceQuery.data?.totalSummary.frozen ?? 0;
  const isLoading = freezeMutation.isPending || consumeMutation.isPending || unfreezeMutation.isPending || deductMutation.isPending;

  return (
    <div className="mt-4">
      <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1 flex items-center gap-2">
        <FlaskConical className="w-4 h-4" />
        Billing Test (Velobase)
      </h2>
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 space-y-4">
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Available: </span>
            <span className="font-mono font-semibold text-foreground">{available.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Frozen: </span>
            <span className="font-mono font-semibold text-yellow-500">{frozen.toLocaleString()}</span>
          </div>
          <button onClick={refetch} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ↻ Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button size="sm" variant="destructive" onClick={() => void handleDirectDeduct()} disabled={isLoading}>
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Direct Deduct (10)
          </Button>
          <Button size="sm" variant="default" onClick={() => void handleFreezeConsume()} disabled={isLoading}>
            <Lock className="w-3.5 h-3.5 mr-1.5" />
            Freeze(15) → Consume(8)
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void handleFreezeUnfreeze()} disabled={isLoading}>
            <Unlock className="w-3.5 h-3.5 mr-1.5" />
            Freeze(20) → Unfreeze(20)
          </Button>
        </div>

        {logs.length > 0 && (
          <div className="rounded-lg bg-black/40 border border-border/30 p-3 max-h-48 overflow-y-auto">
            <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {logs.map((line, i) => (
                <div key={i} className={cn(
                  line.includes("FAILED") && "text-red-400",
                  line.includes("OK") && "text-green-400",
                )}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
