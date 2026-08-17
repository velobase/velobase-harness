"use client"

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
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  Users,
  LayoutDashboard,
  Shield,
  Coins,
  SquareStack,
  Package,
  ShoppingCart,
  Ticket,
  HandCoins,
  Receipt,
  CalendarClock,
  Megaphone,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type NavItem = {
  title: string
  url: string
  icon: LucideIcon
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "dashboard",
    items: [
      { title: "overviewItem", url: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "usersContent",
    items: [
      { title: "usersItem", url: "/admin/users", icon: Users },
      { title: "dialogs", url: "/admin/dialogs", icon: SquareStack },
    ],
  },
  {
    label: "commerce",
    items: [
      { title: "productsItem", url: "/admin/products", icon: Package },
      { title: "ordersItem", url: "/admin/orders", icon: ShoppingCart },
      { title: "creditsItem", url: "/admin/credits", icon: Coins },
      { title: "promoCodesItem", url: "/admin/promo-codes", icon: Ticket },
    ],
  },
  {
    label: "affiliate",
    items: [
      { title: "commissions", url: "/admin/affiliate/commissions", icon: Receipt },
      { title: "payouts", url: "/admin/affiliate/payouts", icon: HandCoins },
    ],
  },
  {
    label: "outreach",
    items: [
      { title: "scenes", url: "/admin/touches/scenes", icon: Megaphone },
      { title: "schedules", url: "/admin/touches", icon: CalendarClock },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const t = useTranslations("admin.nav")

  const isActive = (url: string) => {
    if (url === "/admin") return pathname === "/admin"
    return pathname === url || pathname.startsWith(url + "/")
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">{t("admin")}</span>
                  <span className="text-xs text-muted-foreground">{t("console")}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{t(group.label)}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={t(item.title)}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{t(item.title)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("backToApp")}>
              <Link href="/">
                <span className="text-xs text-muted-foreground">{t("backToApp")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
