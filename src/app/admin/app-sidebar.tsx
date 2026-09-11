"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ChevronRight, Layers, X } from "lucide-react";
import type { FeatureState } from "@velobase/module-runtime";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { AdminUserMenu } from "@/components/admin/shell/user-menu";
import {
  getAdminLocation,
  getAdminNavigation,
  type AdminNavItem,
} from "@/components/admin/shell/navigation";

function NavigationItem({
  item,
  activeHref,
}: {
  item: AdminNavItem;
  activeHref?: string;
}) {
  const t = useTranslations("admin.nav");
  const { state, isMobile, setOpenMobile } = useSidebar();
  const active =
    item.children?.some((child) => child.href === activeHref) ??
    item.href === activeHref;
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  const closeMobile = () => setOpenMobile(false);

  if (!item.children) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={t(item.title)}
          className="admin-nav-link"
        >
          <Link
            href={item.href}
            prefetch={false}
            onClick={closeMobile}
            aria-current={active ? "page" : undefined}
          >
            <item.icon />
            <span>{t(item.title)}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              isActive={active}
              tooltip={t(item.title)}
              className="admin-nav-link"
              aria-label={t(item.title)}
            >
              <item.icon />
              <span>{t(item.title)}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={12}
            className="admin-theme admin-popup min-w-44"
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {t(item.title)}
            </DropdownMenuLabel>
            {item.children.map((child) => (
              <DropdownMenuItem key={child.href} asChild>
                <Link
                  href={child.href}
                  prefetch={false}
                  aria-current={activeHref === child.href ? "page" : undefined}
                >
                  {t(child.title)}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={open ?? active} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className="admin-nav-link admin-nav-parent"
            data-current-parent={active}
          >
            <item.icon />
            <span>{t(item.title)}</span>
            <ChevronRight className="admin-nav-chevron ml-auto size-3.5" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="admin-nav-sub">
            {item.children.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={activeHref === child.href}
                >
                  <Link
                    href={child.href}
                    prefetch={false}
                    onClick={closeMobile}
                    aria-current={
                      activeHref === child.href ? "page" : undefined
                    }
                  >
                    <span>{t(child.title)}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AppSidebar({ features }: { features: FeatureState[] }) {
  const t = useTranslations("admin.nav");
  const shell = useTranslations("admin.shell");
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const groups = getAdminNavigation(features);
  const activeHref = getAdminLocation(pathname, groups)?.link.href;
  const settings = groups.find((group) => group.title === "settings");

  return (
    <Sidebar collapsible="icon">
      <div
        className="admin-theme admin-sidebar-body"
        data-collapsed={state === "collapsed" && !isMobile}
      >
        <SidebarHeader className="admin-sidebar-header">
          <SidebarMenu>
            <SidebarMenuItem className="flex items-center">
              <SidebarMenuButton
                asChild
                size="lg"
                className="admin-brand"
                tooltip={shell("administration")}
              >
                <Link
                  href="/admin"
                  prefetch={false}
                  onClick={() => setOpenMobile(false)}
                  aria-label={shell("administration")}
                >
                  <span className="admin-brand-mark">
                    <Layers className="size-5" />
                  </span>
                  <div className="admin-brand-label grid gap-0.5">
                    <span className="text-base font-semibold tracking-tight">
                      {shell("brand")}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      {shell("administration")}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
              {isMobile && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setOpenMobile(false)}
                  aria-label={shell("closeNavigation")}
                >
                  <X className="size-4" />
                </Button>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="admin-sidebar-content">
          {groups
            .filter((group) => group.title !== "settings")
            .map((group) => (
              <SidebarGroup key={group.title} className="admin-nav-group">
                <SidebarGroupLabel>{t(group.title)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <NavigationItem
                        key={item.title}
                        item={item}
                        activeHref={activeHref}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
        </SidebarContent>
        <SidebarFooter className="admin-sidebar-footer">
          <SidebarMenu>
            {settings?.items.map((item) => (
              <NavigationItem
                key={item.title}
                item={item}
                activeHref={activeHref}
              />
            ))}
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip={t("backToApp")}
                className="admin-nav-link"
              >
                <Link
                  href="/"
                  prefetch={false}
                  onClick={() => setOpenMobile(false)}
                >
                  <ArrowUpRight />
                  <span>{t("backToApp")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <AdminUserMenu />
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
