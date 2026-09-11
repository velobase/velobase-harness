"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function FeatureManager() {
  const t = useTranslations("modules");
  const router = useRouter();
  const utils = api.useUtils();
  const inventory = api.features.inventory.useQuery();
  const update = api.features.setEnabled.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.features.invalidate(),
        utils.conversation.invalidate(),
      ]);
      router.refresh();
    },
  });
  if (inventory.isPending) return <p>{t("loading")}</p>;
  if (inventory.error) return <p role="alert">{t("loadFailed")}</p>;
  return (
    <div className="admin-module-page space-y-5">
      <div>
        <h1 className="sr-only">{t("title")}</h1>
        <p className="admin-module-note">{t("intro")}</p>
      </div>
      {update.error && (
        <p role="alert" className="text-destructive">
          {t("saveFailed")}: {update.error.message}
        </p>
      )}
      <div className="admin-table-surface overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted">
            <tr>
              {["capability", "status", "dependencies", "actions"].map(
                (key) => (
                  <th key={key} className="p-4">
                    {t(key)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {inventory.data?.map((feature) => (
              <tr key={feature.id} className="border-t align-top">
                <td className="p-4">
                  <div className="font-medium">{t(`names.${feature.id}`)}</div>
                  <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
                    {t(`descriptions.${feature.id}`)}
                  </p>
                </td>
                <td className="p-4 whitespace-nowrap">
                  <span className="admin-module-state" data-status={feature.status}>
                    {t(`states.${feature.status}`)}
                  </span>
                  {feature.missing.length > 0 && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {feature.missing
                        .map((id) =>
                          t.has(`names.${id}`) ? t(`names.${id}`) : id,
                        )
                        .join(", ")}
                    </p>
                  )}
                </td>
                <td className="p-4">
                  {feature.dependencies
                    .map((id) => t(`names.${id}`))
                    .join(", ") || t("none")}
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-2">
                    {feature.installed && feature.category !== "foundation" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          update.isPending ||
                          (!feature.requested && feature.missing.length > 0)
                        }
                        onClick={() =>
                          update.mutate({
                            id: feature.id,
                            enabled: !feature.requested,
                          })
                        }
                      >
                        {t(feature.requested ? "disable" : "enable")}
                      </Button>
                    )}
                    {feature.installed && feature.connection && (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/admin/connections?service=${feature.connection}`}
                        >
                          {t("configure")}
                        </Link>
                      </Button>
                    )}
                    {feature.installed && feature.href && (
                      <Button asChild size="sm" variant="ghost">
                        <Link href={feature.href}>{t("manage")}</Link>
                      </Button>
                    )}
                    {!feature.installed && (
                      <span className="text-muted-foreground max-w-xs">
                        {t("absentHelp")}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="admin-module-note">{t("disableHelp")}</p>
    </div>
  );
}
