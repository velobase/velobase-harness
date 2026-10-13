/** OTLP/HTTP configuration helpers, independent of application startup. */
export function traceEndpoint(base?: string, traces?: string): string {
  const endpoint =
    traces ??
    `${(base ?? "http://localhost:4318").replace(/\/+$/, "")}/v1/traces`;
  const url = new URL(endpoint);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("OTLP endpoint must be an HTTP(S) URL without credentials");
  }
  return url.toString();
}

export function traceHeaders(value?: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of value?.split(",") ?? []) {
    const separator = entry.indexOf("=");
    if (separator < 1) throw new Error("Invalid OTLP header configuration");
    const key = entry.slice(0, separator).trim();
    let decoded: string;
    try {
      decoded = decodeURIComponent(entry.slice(separator + 1).trim());
    } catch {
      throw new Error("Invalid OTLP header encoding");
    }
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key) || /[\r\n]/.test(decoded)) {
      throw new Error("Invalid OTLP header configuration");
    }
    headers[key] = decoded;
  }
  return headers;
}
