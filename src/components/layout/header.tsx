"use client";

import { useFeature, FeatureGate } from "@/components/features/feature-gate";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  LogOut,
  Coins,
  CreditCard,
  ArrowRight,
  Tag,
  User,
  History,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/components/auth/store/auth-store";
import { AppLogo } from "@/components/ui/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { logout } from "@/lib/logout";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

type HeaderVariant = "default" | "minimal";

interface HeaderProps {
  variant?: HeaderVariant;
  className?: string;
}

export function Header({ variant = "default", className }: HeaderProps) {
  const t = useTranslations("nav");
  const creditsEnabled = useFeature("credits");
  const { data: session } = useSession();
  const { setLoginModalOpen } = useAuthStore();
  const router = useRouter();
  const handleLogoClick = () => {
    router.push("/");
  };

  const { data: billingStatus } = api.account.getBillingStatus.useQuery(
    undefined,
    {
      enabled: !!session && variant === "default" && creditsEnabled,
      refetchInterval: 10000,
    },
  );

  const credits = billingStatus?.creditsBalance ?? 0;
  const isLowBalance = credits < 500;

  const handleLogout = () => {
    void logout({ callbackUrl: "/", source: "header" });
  };

  if (variant === "minimal") {
    return (
      <header
        className={cn(
          "flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3",
          className,
        )}
      >
        <Link href="/" className="transition-opacity hover:opacity-80">
          <AppLogo size="sm" className="text-white" />
        </Link>
        <Link href="/">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 text-xs text-white/70 hover:text-white"
          >
            {t("tryFree")} <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </header>
    );
  }

  return (
    <>
      <header
        className={cn(
          "absolute top-0 left-0 z-50 w-full bg-transparent backdrop-blur-none",
          className,
        )}
      >
        <div className="flex h-20 items-center px-6 md:px-8">
          <div className="flex flex-1 items-center">
            <button
              onClick={handleLogoClick}
              className="transition-opacity hover:opacity-80"
            >
              <AppLogo size="md" className="text-foreground drop-shadow-md" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <ThemeToggle />
            {session ? (
              <>
                <FeatureGate feature="credits">
                  <Link href="/account/billing">
                    <div
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-sm transition-all ${
                        isLowBalance
                          ? "border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                          : "bg-accent/50 border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      } `}
                    >
                      <Coins
                        className={`h-4 w-4 ${isLowBalance ? "text-orange-400" : "text-yellow-400"}`}
                      />
                      <span className="font-mono text-sm font-medium">
                        {credits.toLocaleString()}
                      </span>
                    </div>
                  </Link>
                </FeatureGate>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="vv-header-user-menu-trigger"
                      variant="ghost"
                      className="hover:bg-accent relative h-8 w-8 rounded-full"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={session.user.image ?? undefined}
                          alt={session.user.name ?? "User"}
                        />
                        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                          {session.user.name?.[0]?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>
                      <p className="text-muted-foreground truncate text-xs leading-none">
                        {session.user.email}
                      </p>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        {t("profile")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/history" className="cursor-pointer">
                        <History className="mr-2 h-4 w-4" />
                        {t("history")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/account/billing" className="cursor-pointer">
                        <CreditCard className="mr-2 h-4 w-4" />
                        {t("billing")}
                      </Link>
                    </DropdownMenuItem>
                    <FeatureGate feature="payments">
                      <DropdownMenuItem asChild>
                        <Link href="/pricing" className="cursor-pointer">
                          <Tag className="mr-2 h-4 w-4" />
                          {t("pricing")}
                        </Link>
                      </DropdownMenuItem>
                    </FeatureGate>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="text-destructive cursor-pointer"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      {t("signOut")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => setLoginModalOpen(true, undefined, "header")}
                className="text-foreground hover:bg-accent hover:text-accent-foreground"
              >
                {t("logIn")}
              </Button>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
