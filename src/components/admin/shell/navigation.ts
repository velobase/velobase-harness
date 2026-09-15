import {
  Blocks,
  Coins,
  Handshake,
  Inbox,
  Megaphone,
  Package,
  PanelsTopLeft,
  Plug,
  ReceiptText,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FeatureState } from "@velobase/module-runtime";

type NavLink = { title: string; href: string };
export type AdminNavItem = NavLink & {
  icon: LucideIcon;
  feature?: string;
  children?: NavLink[];
};
export type AdminNavGroup = { title: string; items: AdminNavItem[] };

// Presentation metadata only. Business modules keep their own routes and state.
const navigation: AdminNavGroup[] = [
  {
    title: "workspace",
    items: [
      { title: "usersItem", href: "/admin/users", icon: Users },
      {
        title: "inbox",
        href: "/admin/email",
        icon: Inbox,
        feature: "email-management",
      },
    ],
  },
  {
    title: "commerce",
    items: [
      {
        title: "productsItem",
        href: "/admin/products",
        icon: Package,
        feature: "products",
      },
      {
        title: "ordersItem",
        href: "/admin/orders",
        icon: ReceiptText,
        feature: "payments",
      },
      {
        title: "creditsItem",
        href: "/admin/credits",
        icon: Coins,
        feature: "credits",
      },
    ],
  },
  {
    title: "growth",
    items: [
      {
        title: "promoCodesItem",
        href: "/admin/promo-codes",
        icon: Ticket,
        feature: "promo-codes",
      },
      {
        title: "affiliate",
        href: "/admin/affiliate",
        icon: Handshake,
        feature: "affiliate",
        children: [
          { title: "commissions", href: "/admin/affiliate/commissions" },
          { title: "payouts", href: "/admin/affiliate/payouts" },
        ],
      },
      {
        title: "outreach",
        href: "/admin/touches",
        icon: Megaphone,
        feature: "touch",
        children: [
          { title: "scenes", href: "/admin/touches/scenes" },
          { title: "schedules", href: "/admin/touches" },
        ],
      },
    ],
  },
  {
    title: "settings",
    items: [
      { title: "features", href: "/admin/features", icon: Blocks },
      { title: "connections", href: "/admin/connections", icon: Plug },
      {
        title: "dialogs",
        href: "/admin/dialogs",
        icon: PanelsTopLeft,
        feature: "ai-chat",
      },
    ],
  },
];

export function getAdminNavigation(features: FeatureState[]): AdminNavGroup[] {
  const installed = new Set(
    features
      .filter((feature) => feature.installed)
      .map((feature) => feature.id),
  );
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.feature || installed.has(item.feature),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function getAdminLocation(pathname: string, groups: AdminNavGroup[]) {
  const routes = groups.flatMap((group) =>
    group.items.flatMap((item) =>
      (item.children ?? [item]).map((link) => ({ group, item, link })),
    ),
  );
  return routes
    .filter(
      ({ link }) =>
        pathname === link.href || pathname.startsWith(`${link.href}/`),
    )
    .sort((a, b) => b.link.href.length - a.link.href.length)[0];
}
