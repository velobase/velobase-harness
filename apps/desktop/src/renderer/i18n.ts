const en = {
  title: "Service status",
  description: "Check the connection to your Velobase server.",
  loading: "Connecting…",
  ok: "Connected",
  error: "Unable to connect. Check your server and try again.",
  refresh: "Refresh",
};
const zh: typeof en = {
  title: "服务状态",
  description: "检查与 Velobase 服务器的连接。",
  loading: "连接中…",
  ok: "已连接",
  error: "无法连接，请检查服务器后重试。",
  refresh: "刷新",
};
export function getTranslations(locale: string) {
  const messages = locale.startsWith("zh") ? zh : en;
  return (key: keyof typeof en) => messages[key];
}
