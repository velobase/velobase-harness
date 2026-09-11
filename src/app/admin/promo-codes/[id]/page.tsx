import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { api } from "@/trpc/server";
export default async function Participants({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { id } = await params;
  const { cursor } = await searchParams;
  const t = await getTranslations("modules");
  const data = await api.admin.listPromoRedemptions({
    promoCodeId: id,
    cursor,
  });
  return (
    <div className="admin-module-page space-y-4">
      <h1 className="text-2xl font-semibold">{t("participation")}</h1>
      {!data.items.length && <p>{t("empty")}</p>}
      {data.items.map((row) => (
        <article key={row.id} className="admin-participant-row">
          <p>{row.email ?? row.userId}</p>
          <p>
            {row.creditsGranted} · {row.redeemedAt.toISOString()}
          </p>
        </article>
      ))}
      {data.nextCursor && (
        <Link
          href={`/admin/promo-codes/${id}?cursor=${encodeURIComponent(data.nextCursor)}`}
        >
          {t("nextPage")}
        </Link>
      )}
    </div>
  );
}
