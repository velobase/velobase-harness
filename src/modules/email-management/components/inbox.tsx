"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function Inbox() {
  const t = useTranslations("mailManagement");
  const utils = api.useUtils();
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState<string>();
  const [timelineCursor, setTimelineCursor] = useState<string>();
  const [status, setStatus] = useState<
    "OPEN" | "NEEDS_APPROVAL" | "WAITING" | "SOLVED" | "ALL"
  >("OPEN");
  const features = api.features.inventory.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const enabled =
    features.data?.some(
      (feature) => feature.id === "email-management" && feature.enabled,
    ) ?? false;
  const tickets = api.emailManagement.list.useQuery(
    { cursor, status: status === "ALL" ? undefined : status },
    { refetchInterval: 15000 },
  );
  const ticket = api.emailManagement.ticket.useQuery(
    { id: selected ?? "", cursor: timelineCursor },
    { enabled: Boolean(selected), refetchInterval: 10000 },
  );
  const refresh = () => utils.emailManagement.invalidate();
  const sync = api.emailManagement.sync.useMutation({ onSuccess: refresh });
  const reply = api.emailManagement.reply.useMutation({
    onSuccess: async () => {
      setBody("");
      setRequestId(undefined);
      await refresh();
    },
  });
  const cancelReply = api.emailManagement.cancelReply.useMutation({
    onSuccess: refresh,
  });
  const update = api.emailManagement.setStatus.useMutation({
    onSuccess: refresh,
  });
  const error =
    tickets.error ||
    ticket.error ||
    sync.error ||
    reply.error ||
    update.error ||
    cancelReply.error;
  const timeline = ticket.data?.timeline.slice(0, 20) ?? [];
  return (
    <div className="admin-module-page space-y-4">
      <div className="admin-module-toolbar">
        <h1 className="sr-only">{t("title")}</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/connections#mailbox">{t("configure")}</Link>
          </Button>
          <Button
            disabled={!enabled || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {t(sync.isPending ? "syncing" : "sync")}
          </Button>
        </div>
      </div>
      {!enabled && (
        <p className="bg-muted rounded-lg border p-4">
          {t("disabled")}{" "}
          <Link className="underline" href="/admin/features">
            {t("features")}
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {t("failed")}
        </p>
      )}
      {sync.isSuccess && (
        <p role="status">{t("synced", { count: sync.data.imported })}</p>
      )}
      <div className="admin-inbox-layout">
        <section className="admin-inbox-list space-y-3">
          <label className="block text-sm">
            {t("filter")}
            <select
              className="bg-background mt-1 w-full rounded-md border p-2"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setCursor(undefined);
              }}
            >
              {(
                ["OPEN", "NEEDS_APPROVAL", "WAITING", "SOLVED", "ALL"] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`statuses.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {tickets.isPending && <p>{t("loading")}</p>}
          {tickets.data?.items.length === 0 && (
            <p className="text-muted-foreground py-8">{t("empty")}</p>
          )}
          {tickets.data?.items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={reply.isPending}
              className="admin-inbox-ticket"
              aria-pressed={selected === item.id}
              onClick={() => {
                setSelected(item.id);
                setTimelineCursor(undefined);
                setBody("");
                setRequestId(undefined);
              }}
            >
              <p className="truncate font-medium">
                {item.subject || t("untitled")}
              </p>
              <p className="truncate text-sm">{item.contact}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {t(`statuses.${item.status}`)} ·{" "}
                {t(`actors.${item.assignedTo}`)}
              </p>
            </button>
          ))}
          <div className="flex gap-2">
            {cursor && (
              <Button variant="outline" onClick={() => setCursor(undefined)}>
                {t("firstPage")}
              </Button>
            )}
            {tickets.data?.nextCursor && (
              <Button
                variant="outline"
                onClick={() => setCursor(tickets.data?.nextCursor)}
              >
                {t("nextPage")}
              </Button>
            )}
          </div>
        </section>
        <section className="admin-inbox-detail space-y-4">
          {!selected ? (
            <p className="text-muted-foreground">{t("select")}</p>
          ) : ticket.isPending ? (
            <p>{t("loading")}</p>
          ) : !ticket.data ? (
            <p>{t("notFound")}</p>
          ) : (
            <>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {ticket.data.subject || t("untitled")}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {ticket.data.contact}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={!enabled || update.isPending}
                  onClick={() =>
                    update.mutate({
                      id: ticket.data!.id,
                      status:
                        ticket.data!.status === "SOLVED" ? "OPEN" : "SOLVED",
                    })
                  }
                >
                  {t(ticket.data.status === "SOLVED" ? "reopen" : "resolve")}
                </Button>
              </div>
              <div className="flex gap-2">
                {timelineCursor && (
                  <Button
                    variant="ghost"
                    onClick={() => setTimelineCursor(undefined)}
                  >
                    {t("latest")}
                  </Button>
                )}
                {ticket.data.timeline.length > 20 && (
                  <Button
                    variant="ghost"
                    onClick={() => setTimelineCursor(timeline.at(-1)?.id)}
                  >
                    {t("older")}
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {[...timeline].reverse().map((entry) => (
                  <article
                    key={entry.id}
                    className="admin-inbox-message"
                  >
                    <p className="text-muted-foreground mb-2 text-xs">
                      {t(`actors.${entry.actor}`)} ·{" "}
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {entry.type === "SYSTEM" &&
                      (entry.content === "OPEN" || entry.content === "SOLVED")
                        ? t(`statuses.${entry.content}`)
                        : entry.content}
                    </p>
                  </article>
                ))}
              </div>
              {ticket.data.replies.map((item) => (
                <article key={item.id} className="admin-inbox-reply space-y-2">
                  <p className="text-sm font-medium">
                    {t(`deliveries.${item.status}`)}
                  </p>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {item.body}
                  </p>
                  {item.status === "PENDING" && (
                    <Button
                      variant="outline"
                      disabled={cancelReply.isPending}
                      onClick={() => cancelReply.mutate({ id: item.id })}
                    >
                      {t("cancelPending")}
                    </Button>
                  )}
                  {item.status === "UNKNOWN" && (
                    <p className="text-muted-foreground mt-2 text-xs">
                      {t("unknownHelp")}
                    </p>
                  )}
                </article>
              ))}
              <form
                className="space-y-3 border-t pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!selected) return;
                  const id = requestId ?? crypto.randomUUID();
                  setRequestId(id);
                  reply.mutate({ ticketId: selected, requestId: id, body });
                }}
              >
                <label className="block text-sm" htmlFor="reply">
                  {t("reply")}
                </label>
                <Textarea
                  id="reply"
                  rows={5}
                  maxLength={50000}
                  required
                  value={body}
                  disabled={!enabled || reply.isPending}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setRequestId(undefined);
                  }}
                />
                <Button disabled={!enabled || reply.isPending || !body.trim()}>
                  {t(reply.isPending ? "sending" : "send")}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
