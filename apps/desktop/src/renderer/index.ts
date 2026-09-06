import type { DesktopBridge } from "../bridge";
import { getTranslations } from "./i18n";

declare global {
  interface Window {
    velobase: DesktopBridge;
  }
}

const t = getTranslations(navigator.language);
document.documentElement.lang = navigator.language;
document.title = t("title");
const root = document.querySelector("main");
if (!root) throw new Error("Missing renderer root");
const title = document.createElement("h1");
title.textContent = t("title");
const description = document.createElement("p");
description.textContent = t("description");
const status = document.createElement("p");
status.setAttribute("role", "status");
const timestamp = document.createElement("time");
const button = document.createElement("button");
button.textContent = t("refresh");
root.append(title, description, status, timestamp, button);

async function refresh() {
  button.disabled = true;
  status.textContent = t("loading");
  timestamp.textContent = "";
  try {
    const health = await window.velobase.getHealth();
    status.textContent = t("ok");
    timestamp.textContent = health.timestamp;
    timestamp.dateTime = health.timestamp;
  } catch {
    status.textContent = t("error");
  } finally {
    button.disabled = false;
  }
}
button.addEventListener("click", () => {
  void refresh();
});
void refresh();
