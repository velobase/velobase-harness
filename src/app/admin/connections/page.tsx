import { getTranslations } from "next-intl/server";
import { IntegrationModuleStatusPanel } from "@/components/dashboard/integration-module-status-panel";
import { MailboxSettings } from "@/components/features/mailbox-settings";
import { installedFeatures } from "@velobase/example-composition";
export default async function ConnectionsPage() {
  const t = await getTranslations("modules");
  return (
    <div className="admin-module-page admin-connections space-y-7">
      <h1 className="sr-only">{t("connections")}</h1>
      <p className="admin-module-note">{t("connectionsHelp")}</p>
      {(installedFeatures as readonly string[]).includes(
        "email-management",
      ) && <MailboxSettings />}
      <IntegrationModuleStatusPanel />
    </div>
  );
}
