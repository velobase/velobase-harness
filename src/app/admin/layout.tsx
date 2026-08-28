import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { AppSidebar } from "./app-sidebar"
import { redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { getTranslations } from "next-intl/server"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  
  if (!session?.user?.isAdmin) {
    redirect("/")
  }

  const t = await getTranslations("admin.layout")

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="font-medium text-sm">{t("console")}</span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
