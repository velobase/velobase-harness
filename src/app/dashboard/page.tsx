"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  User,
  CreditCard,
  Settings,
  Activity,
  ShieldCheck,
  Puzzle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Background } from "@/components/layout/background";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
}

const frameworkPages: NavItem[] = [
  {
    title: "Overview",
    href: "/dashboard",
    icon: Activity,
    description: "System status & quick actions",
  },
  {
    title: "Profile",
    href: "/account/profile",
    icon: User,
    description: "Manage your profile & account",
  },
  {
    title: "Billing",
    href: "/account/billing",
    icon: CreditCard,
    description: "Subscription, credits & payment history",
  },
  {
    title: "Settings",
    href: "/account/settings",
    icon: Settings,
    description: "Account settings & integrations",
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

interface ModuleStatus {
  name: string;
  enabled: boolean;
  category: string;
}

function getModuleStatuses(): ModuleStatus[] {
  // Client-side: read from a global exposed by the server, or infer from env
  // For SSR/client rendering, we read NEXT_PUBLIC_ vars and infer
  return [
    { name: "PostHog", enabled: !!process.env.NEXT_PUBLIC_POSTHOG_KEY, category: "Analytics" },
    { name: "Google Ads", enabled: !!process.env.NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ID, category: "Analytics" },
    { name: "Lark", enabled: false, category: "Messaging" }, // server-only env, defaults to unknown on client
    { name: "Telegram", enabled: !!process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME, category: "Messaging" },
    { name: "NowPayments", enabled: false, category: "Payment" }, // server-only env
    { name: "Affiliate", enabled: true, category: "Features" }, // on by default
    { name: "AI Chat", enabled: true, category: "Features" }, // on by default if any LLM key
  ];
}

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

function ModuleStatusPanel() {
  const [modules] = useState(() => getModuleStatuses());
  const categories = [...new Set(modules.map((m) => m.category))];

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3 px-1 flex items-center gap-2">
        <Puzzle className="w-4 h-4" />
        Module Status
      </h2>
      <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5">
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                {cat}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {modules
                  .filter((m) => m.category === cat)
                  .map((mod) => (
                    <div
                      key={mod.name}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/50 border border-border/30"
                    >
                      {mod.enabled ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          mod.enabled ? "text-foreground" : "text-muted-foreground/60",
                        )}
                      >
                        {mod.name}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/50 mt-4">
          Module availability is determined by environment configuration. Server-only modules show client-side inference.
        </p>
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
            Manage your account and explore framework features.
          </p>
        </div>

        <div className="space-y-8">
          <PageSection title="Framework" items={frameworkPages} />
          {isAdmin && <PageSection title="Administration" items={adminPages} />}
          <ModuleStatusPanel />
        </div>
      </main>
    </div>
  );
}
