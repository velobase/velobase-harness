"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TouchesTable } from "@/components/admin/touches/touches-table";
export default function TouchesPage() {
  const t = useTranslations("outreach");
  return (
    <div className="space-y-4">
      <Link className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" href="/admin/touches/outreach">{t("title")}</Link>
      <TouchesTable />
    </div>
  );
}
