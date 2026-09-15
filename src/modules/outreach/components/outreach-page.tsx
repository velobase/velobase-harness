"use client";
import { useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { useFeature } from "@/components/features/feature-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export function OutreachPage() {
  const t = useTranslations("outreach");
  const enabled = useFeature("touch");
  const [scene, setScene] = useState("");
  const [sceneCursor, setSceneCursor] = useState<string>();
  const [templateCursor, setTemplateCursor] = useState<string>();
  const [deliveryCursor, setDeliveryCursor] = useState<string>();
  const [userCursor, setUserCursor] = useState<string>();
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState<string>();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const utils = api.useUtils();
  const scenes = api.outreach.scenes.useQuery({ cursor: sceneCursor });
  const templates = api.outreach.templates.useQuery(
    { sceneKey: scene, cursor: templateCursor },
    { enabled: !!scene },
  );
  const schedules = api.outreach.schedules.useQuery(
    { cursor: deliveryCursor },
    { refetchInterval: 15000 },
  );
  const users = api.outreach.recipients.useQuery({
    cursor: userCursor,
    search,
  });
  const refresh = () => utils.outreach.invalidate();
  const saveScene = api.outreach.saveScene.useMutation({ onSuccess: refresh });
  const saveTemplate = api.outreach.saveTemplate.useMutation({
    onSuccess: refresh,
  });
  const schedule = api.outreach.schedule.useMutation({
    onSuccess: async () => {
      setRequestId(crypto.randomUUID());
      await refresh();
    },
  });
  const cancel = api.outreach.cancel.useMutation({ onSuccess: refresh });
  const process = api.outreach.processDue.useMutation({ onSuccess: refresh });
  const error =
    saveScene.error ||
    saveTemplate.error ||
    schedule.error ||
    cancel.error ||
    process.error ||
    scenes.error ||
    templates.error ||
    schedules.error ||
    users.error;
  return (
    <div className="admin-module-page admin-outreach space-y-6">
      <h1 className="sr-only">{t("title")}</h1>
      <p className="admin-module-note">{t("intro")}</p>
      <div className="admin-module-toolbar justify-start">
        <Link href="/admin/touches">{t("legacyHistory")}</Link>
        <Link href="/admin/features">{t("features")}</Link>
        <Link href="/admin/touches/scenes">{t("editScenes")}</Link>
      </div>
      {!enabled && <p>{t("disabled")}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {t("failed")}: {error.message}
        </p>
      )}
      {formError && <p role="alert">{formError}</p>}
      <section className="admin-module-section space-y-4">
        <h2 className="font-semibold">{t("scenes")}</h2>
        <select
          className="rounded border p-2"
          value={scene}
          onChange={(event) => {
            setScene(event.target.value);
            setTemplateCursor(undefined);
          }}
        >
          <option value="">{t("chooseScene")}</option>
          {scenes.data?.items.map((item) => (
            <option key={item.key} value={item.key}>
              {item.name}
            </option>
          ))}
        </select>
        {scenes.data?.nextCursor && (
          <Button
            variant="outline"
            onClick={() => setSceneCursor(scenes.data?.nextCursor)}
          >
            {t("next")}
          </Button>
        )}
        {sceneCursor && (
          <Button variant="outline" onClick={() => setSceneCursor(undefined)}>
            {t("first")}
          </Button>
        )}
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            saveScene.mutate({
              key: String(data.get("key")),
              name: String(data.get("name")),
              description: "",
              isActive: data.get("active") === "on",
            });
          }}
        >
          <label>
            {t("sceneKey")}
            <Input name="key" required pattern="[a-z0-9_]+" />
          </label>
          <label>
            {t("name")}
            <Input name="name" required />
          </label>
          <label>
            <input type="checkbox" name="active" /> {t("active")}
          </label>
          <Button disabled={saveScene.isPending}>{t("saveScene")}</Button>
        </form>
      </section>
      {scene && (
        <section className="admin-module-section space-y-4">
          <h2 className="font-semibold">{t("templates")}</h2>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              saveTemplate.mutate({
                sceneKey: scene,
                name: String(data.get("name")),
                subject: String(data.get("subject")),
                text: String(data.get("text")),
              });
            }}
          >
            <label>
              {t("name")}
              <Input name="name" required />
            </label>
            <label>
              {t("subject")}
              <Input name="subject" required />
            </label>
            <label>
              {t("text")}
              <Textarea name="text" required rows={4} />
            </label>
            <Button disabled={saveTemplate.isPending}>
              {t("saveTemplate")}
            </Button>
          </form>
          <h2 className="font-semibold">{t("schedule")}</h2>
          <p>{t("snapshotHelp")}</p>
          <label>
            {t("searchUser")}
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setUserCursor(undefined);
              }}
            />
          </label>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              try {
                const variables = z
                  .record(z.string())
                  .parse(JSON.parse(String(data.get("variables") || "{}")));
                setFormError(undefined);
                schedule.mutate({
                  sceneKey: scene,
                  templateId: String(data.get("templateId")),
                  recipientId: String(data.get("recipientId")),
                  requestId,
                  scheduledAt: new Date(
                    String(data.get("scheduledAt")),
                  ).toISOString(),
                  variables,
                });
              } catch {
                setFormError(t("invalidVariables"));
              }
            }}
          >
            <label>
              {t("templates")}
              <select
                className="ml-3 rounded border p-2"
                name="templateId"
                required
              >
                {templates.data?.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("recipient")}
              <select
                className="ml-3 rounded border p-2"
                name="recipientId"
                required
              >
                {users.data?.items.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("when")}
              <Input name="scheduledAt" type="datetime-local" required />
            </label>
            <label>
              {t("variables")}
              <Textarea name="variables" defaultValue="{}" />
            </label>
            <Button
              disabled={
                !enabled ||
                !templates.data?.items.length ||
                !users.data?.items.length ||
                schedule.isPending
              }
            >
              {t("schedule")}
            </Button>
          </form>
          <div className="flex gap-3">
            {templates.data?.nextCursor && (
              <Button
                variant="outline"
                onClick={() => setTemplateCursor(templates.data?.nextCursor)}
              >
                {t("templates")} · {t("next")}
              </Button>
            )}
            {templateCursor && (
              <Button
                variant="outline"
                onClick={() => setTemplateCursor(undefined)}
              >
                {t("templates")} · {t("first")}
              </Button>
            )}
            {users.data?.nextCursor && (
              <Button
                variant="outline"
                onClick={() => setUserCursor(users.data?.nextCursor)}
              >
                {t("recipient")} · {t("next")}
              </Button>
            )}
            {userCursor && (
              <Button
                variant="outline"
                onClick={() => setUserCursor(undefined)}
              >
                {t("recipient")} · {t("first")}
              </Button>
            )}
          </div>
        </section>
      )}
      <section className="admin-module-section space-y-4">
        <h2 className="font-semibold">{t("deliveries")}</h2>
        <p>{t("unknownHelp")}</p>
        <Button
          disabled={!enabled || process.isPending}
          onClick={() => process.mutate()}
        >
          {t("process")}
        </Button>
        {schedules.data?.items.length === 0 && <p>{t("empty")}</p>}
        {schedules.data?.items.map((item) => (
          <article key={item.id} className="admin-module-section space-y-2">
            <h3 className="font-medium">{item.snapshot.subject}</h3>
            <p>
              {item.snapshot.to} · {item.scheduledAt.toLocaleString()} ·{" "}
              {t(`statuses.${item.status}`)}
            </p>
            <details>
              <summary>{t("content")}</summary>
              <pre className="whitespace-pre-wrap">{item.snapshot.text}</pre>
            </details>
            {item.status === "PENDING" && (
              <Button
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate({ id: item.id })}
              >
                {t("cancel")}
              </Button>
            )}
          </article>
        ))}
        {schedules.data?.nextCursor && (
          <Button
            variant="outline"
            onClick={() => setDeliveryCursor(schedules.data?.nextCursor)}
          >
            {t("next")}
          </Button>
        )}
        {deliveryCursor && (
          <Button
            variant="outline"
            onClick={() => setDeliveryCursor(undefined)}
          >
            {t("first")}
          </Button>
        )}
      </section>
    </div>
  );
}
