"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, type ComponentType } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  User,
  CreditCard,
  Settings,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Background } from "@/components/layout/background";
import { IntegrationModuleStatusPanel } from "@/components/dashboard/integration-module-status-panel";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
}

function PageCard({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "group border-border/50 bg-card/50 flex items-start gap-4 rounded-xl border p-4 backdrop-blur-sm",
        "hover:bg-accent/50 hover:border-border transition-all duration-200 hover:shadow-md",
      )}
    >
      <div className="bg-primary/10 text-primary group-hover:bg-primary/20 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors">
        <item.icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-foreground group-hover:text-foreground text-sm font-medium">
            {item.title}
          </h3>
          {item.badge && (
            <span className="rounded border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-500">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {item.description}
        </p>
      </div>
    </Link>
  );
}

function PageSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <h2 className="text-muted-foreground mb-3 px-1 text-sm font-medium">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <PageCard key={item.href} item={item} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [status, router]);

  if (status === "loading" || !session) {
    return (
      <div className="bg-background flex min-h-screen w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    );
  }

  const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin ?? false;
  const frameworkPages: NavItem[] = [
    {
      title: t("pages.overview.title"),
      href: "/dashboard",
      icon: Activity,
      description: t("pages.overview.description"),
    },
    {
      title: t("pages.profile.title"),
      href: "/account/profile",
      icon: User,
      description: t("pages.profile.description"),
    },
    {
      title: t("pages.billing.title"),
      href: "/account/billing",
      icon: CreditCard,
      description: t("pages.billing.description"),
    },
    {
      title: t("pages.settings.title"),
      href: "/account/settings",
      icon: Settings,
      description: t("pages.settings.description"),
    },
  ];
  const adminPages: NavItem[] = [
    {
      title: t("pages.admin.title"),
      href: "/admin",
      icon: ShieldCheck,
      description: t("pages.admin.description"),
      badge: t("adminBadge"),
    },
  ];

  return (
    <div className="bg-background text-foreground relative min-h-dvh w-full overflow-x-hidden font-sans">
      <Background />
      <Header />

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-28 pb-16 sm:px-6">
        <div className="mb-8">
          <h1 className="text-foreground text-2xl font-semibold">
            {session.user.name
              ? t("welcomeNamed", { name: session.user.name })
              : t("welcome")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
        </div>

        <div className="space-y-8">
          <PageSection title={t("framework")} items={frameworkPages} />
          {isAdmin && (
            <>
              <PageSection title={t("administration")} items={adminPages} />
              <IntegrationModuleStatusPanel />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
