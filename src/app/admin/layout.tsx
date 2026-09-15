import { getFeatureStates } from "@/server/features/state";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { AdminHeader } from "@/components/admin/shell/header";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";
import "./admin.css";
import "./modules.css";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.isAdmin) {
    redirect("/");
  }

  const [t, features, cookieStore] = await Promise.all([
    getTranslations("admin.shell"),
    getFeatureStates(),
    cookies(),
  ]);

  return (
    <SidebarProvider
      className="admin-theme admin-shell"
      defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      style={
        {
          "--sidebar-width": "15rem",
          "--sidebar-width-icon": "3.5rem",
        } as CSSProperties
      }
    >
      <a href="#admin-main-content" className="admin-skip-link">
        {t("skipToContent")}
      </a>
      <AppSidebar features={features} />
      <SidebarInset>
        <AdminHeader features={features} />
        <div
          id="admin-main-content"
          tabIndex={-1}
          className="admin-main-content"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
