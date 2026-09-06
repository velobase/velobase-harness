"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { HealthResponse } from "@velobase/contracts";
import { webApi } from "./client";

export default function HealthPage() {
  const t = useTranslations("product.platformHealth");
  const [health, setHealth] = useState<HealthResponse>();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const refresh = async () => {
    setState("loading");
    try {
      setHealth(await webApi.getHealth());
      setState("ok");
    } catch {
      setState("error");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p>{t("description")}</p>
      <p role="status">{t(state)}</p>
      {state === "ok" && health && (
        <time dateTime={health.timestamp}>{health.timestamp}</time>
      )}
      <button
        className="rounded border p-3 disabled:opacity-50"
        onClick={refresh}
        disabled={state === "loading"}
      >
        {t("refresh")}
      </button>
    </main>
  );
}
