"use client";

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
import { LogOut, Coins, CreditCard, ArrowRight, Tag, User, History } from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/components/auth/store/auth-store";
import { VibeLogo } from "@/components/ui/vibe-logo";
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
  const { data: session } = useSession();
  const { setLoginModalOpen } = useAuthStore();
  const router = useRouter();
  const handleLogoClick = () => {
    router.push('/');
  };

  const { data: billingStatus } = api.account.getBillingStatus.useQuery(undefined, {
    enabled: !!session && variant === "default",
    refetchInterval: 10000,
  });

  const credits = billingStatus?.creditsBalance ?? 0;
  const isLowBalance = credits < 500;

  const handleLogout = () => {
    void logout({ callbackUrl: "/", source: "header" });
  };

  if (variant === "minimal") {
    return (
      <header className={cn(
        "shrink-0 px-4 py-3 flex items-center justify-between border-b border-white/5",
        className
      )}>
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <VibeLogo size="sm" className="text-white" />
        </Link>
        <Link href="/">
          <Button
            size="sm"
            variant="ghost"
            className="text-white/70 hover:text-white text-xs gap-1"
          >
            {t("tryFree")} <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </header>
    );
  }

  return (
    <>
      <header className={cn(
        "absolute top-0 left-0 z-50 w-full bg-transparent backdrop-blur-none",
        className
      )}>
        <div className="flex h-20 items-center px-6 md:px-8">
          <div className="flex items-center flex-1">
            <button onClick={handleLogoClick} className="hover:opacity-80 transition-opacity">
              <VibeLogo size="md" className="text-foreground drop-shadow-md" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <ThemeToggle />
            {session ? (
              <>
                <Link href="/pricing">
                  <div className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm transition-all
                    ${isLowBalance
                      ? "bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                      : "bg-accent/50 border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                    }
                  `}>
                    <Coins className={`w-4 h-4 ${isLowBalance ? "text-orange-400" : "text-yellow-400"}`} />
                    <span className="text-sm font-medium font-mono">
                      {credits.toLocaleString()}
                    </span>
                  </div>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      id="vv-header-user-menu-trigger"
                      variant="ghost"
                      className="relative h-8 w-8 rounded-full hover:bg-accent"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={session.user.image ?? undefined}
                          alt={session.user.name ?? "User"}
                        />
                        <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                          {session.user.name?.[0]?.toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>
                      <p className="text-xs leading-none text-muted-foreground truncate">
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
                    <DropdownMenuItem asChild>
                      <Link href="/pricing" className="cursor-pointer">
                        <Tag className="mr-2 h-4 w-4" />
                        {t("pricing")}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="cursor-pointer text-destructive"
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
