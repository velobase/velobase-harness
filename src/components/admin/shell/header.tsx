"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import type { FeatureState } from "@velobase/module-runtime";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AdminLanguageMenu } from "./preferences";
import { getAdminLocation, getAdminNavigation } from "./navigation";

export function AdminHeader({ features }: { features: FeatureState[] }) {
  const t = useTranslations("admin.nav");
  const shell = useTranslations("admin.shell");
  const pathname = usePathname();
  const location = getAdminLocation(pathname, getAdminNavigation(features));
  const isDetail = location && pathname !== location.link.href;

  return (
    <header className="admin-header">
      <SidebarTrigger
        aria-label={shell("toggleNavigation")}
        className="admin-navigation-trigger"
      />
      <div className="admin-header-divider" />
      <nav aria-label={shell("breadcrumb")} className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-[13px] sm:gap-2.5">
          {location ? (
            <>
              <li className="text-muted-foreground hidden shrink-0 sm:block">
                {t(location.group.title)}
              </li>
              <li
                aria-hidden="true"
                className="text-muted-foreground hidden sm:block"
              >
                <ChevronRight className="size-3" />
              </li>
              {location.item.children && (
                <>
                  <li className="text-muted-foreground hidden shrink-0 lg:block">
                    {t(location.item.title)}
                  </li>
                  <li
                    aria-hidden="true"
                    className="text-muted-foreground hidden lg:block"
                  >
                    <ChevronRight className="size-3" />
                  </li>
                </>
              )}
              <li
                className="truncate"
                aria-current={isDetail ? undefined : "page"}
              >
                {isDetail ? (
                  <Link
                    href={location.link.href}
                    prefetch={false}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t(location.link.title)}
                  </Link>
                ) : (
                  t(location.link.title)
                )}
              </li>
              {isDetail && (
                <>
                  <li aria-hidden="true">
                    <ChevronRight className="text-muted-foreground size-3" />
                  </li>
                  <li className="shrink-0" aria-current="page">
                    {shell("details")}
                  </li>
                </>
              )}
            </>
          ) : (
            <li aria-current="page">{shell("administration")}</li>
          )}
        </ol>
      </nav>
      <AdminLanguageMenu />
    </header>
  );
}
