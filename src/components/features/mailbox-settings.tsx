"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MailboxSettings() {
  const t = useTranslations("modules.mailbox");
  const router = useRouter();
  const utils = api.useUtils();
  const inspect = api.features.verifyMailbox.useMutation();
  const current = api.features.mailbox.useQuery();
  const save = api.features.saveMailbox.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.features.mailbox.invalidate(),
        utils.features.inventory.invalidate(),
      ]);
      router.refresh();
    },
  });
  if (current.isPending) return <p>{t("loading")}</p>;
  if (current.error) return <p role="alert">{t("loadFailed")}</p>;
  const config = current.data?.config;
  return (
    <section id="mailbox" className="admin-mailbox-settings space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          save.mutate({
            address: String(data.get("address")),
            password: String(data.get("password")) || undefined,
            imapHost: String(data.get("imapHost")),
            imapPort: Number(data.get("imapPort")),
            smtpHost: String(data.get("smtpHost")),
            smtpPort: Number(data.get("smtpPort")),
            from: String(data.get("from")) || undefined,
          });
        }}
      >
        {(
          [
            "address",
            "password",
            "imapHost",
            "imapPort",
            "smtpHost",
            "smtpPort",
            "from",
          ] as const
        ).map((field) => (
          <label key={field} className="space-y-1 text-sm">
            <span>{t(field)}</span>
            <Input
              name={field}
              type={
                field === "password"
                  ? "password"
                  : field === "address"
                    ? "email"
                    : field.endsWith("Port")
                      ? "number"
                      : "text"
              }
              autoComplete={field === "password" ? "new-password" : "off"}
              required={field !== "password" && field !== "from"}
              defaultValue={
                field === "password"
                  ? ""
                  : (config?.[field] ??
                    (field === "imapPort"
                      ? 993
                      : field === "smtpPort"
                        ? 465
                        : ""))
              }
            />
          </label>
        ))}
        <p className="text-muted-foreground text-xs sm:col-span-2">
          {t("passwordHelp")}
        </p>
        <div className="sm:col-span-2">
          <Button disabled={save.isPending}>
            {t(save.isPending ? "saving" : "save")}
          </Button>
        </div>
        {save.error && (
          <p role="alert" className="text-destructive sm:col-span-2">
            {t("failed")}
          </p>
        )}
        {save.isSuccess && (
          <p role="status" className="sm:col-span-2">
            {t("saved")}
          </p>
        )}
      </form>
      <Button
        variant="outline"
        disabled={
          !current.data?.configured || inspect.isPending || save.isPending
        }
        onClick={() => inspect.mutate()}
      >
        {t(inspect.isPending ? "checking" : "check")}
      </Button>
      {inspect.isSuccess && <p role="status">{t("connected")}</p>}
      {inspect.error && (
        <p role="alert" className="text-destructive">
          {t("connectionFailed")}
        </p>
      )}
    </section>
  );
}
