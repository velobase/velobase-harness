"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout } from "@/lib/logout";

export function AdminUserMenu() {
  const t = useTranslations("admin.shell");
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  useEffect(() => setMounted(true), []);

  const user = session?.user;
  if (!user) return null;
  const name = user.name || user.email || t("administrator");
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "A";

  async function handleLogout() {
    setSigningOut(true);
    setLogoutError(false);
    try {
      await logout({ callbackUrl: "/", source: "sidebar" });
    } catch {
      setLogoutError(true);
      setSigningOut(false);
    }
  }

  return (
    <div className="admin-user-footer">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="admin-user-trigger"
                tooltip={t("accountMenu")}
                aria-label={t("accountMenu")}
                disabled={signingOut}
              >
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={user.image || undefined} alt={name} />
                  <AvatarFallback className="admin-avatar-fallback rounded-lg">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="admin-user-label grid min-w-0 flex-1 gap-0.5 text-left">
                  <span className="truncate text-[13px] font-medium">
                    {name}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {t(signingOut ? "signingOut" : "administrator")}
                  </span>
                </div>
                <ChevronsUpDown className="admin-user-chevron text-muted-foreground size-3.5" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "top" : "right"}
              align="end"
              sideOffset={10}
              className="admin-theme admin-popup w-64"
            >
              <DropdownMenuLabel className="grid gap-1 px-3 py-3">
                <span className="truncate font-medium">{name}</span>
                <span className="text-muted-foreground truncate text-xs font-normal">
                  {user.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={!mounted}>
                  {mounted && theme === "dark" ? (
                    <Moon />
                  ) : mounted && theme === "light" ? (
                    <Sun />
                  ) : (
                    <Monitor />
                  )}
                  {t("appearance")}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {mounted
                      ? t(
                          `themes.${theme === "light" || theme === "dark" ? theme : "system"}`,
                        )
                      : ""}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="admin-theme admin-popup min-w-40">
                  <DropdownMenuRadioGroup
                    value={mounted ? theme : undefined}
                    onValueChange={setTheme}
                  >
                    <DropdownMenuRadioItem value="light">
                      <Sun />
                      {t("themes.light")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">
                      <Moon />
                      {t("themes.dark")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">
                      <Monitor />
                      {t("themes.system")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={signingOut}
                onSelect={() => void handleLogout()}
              >
                <LogOut />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {logoutError && (
        <p role="alert" className="text-destructive px-2 pt-2 text-xs">
          {t("logoutError")}
        </p>
      )}
    </div>
  );
}
