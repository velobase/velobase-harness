import { z } from "zod";

export function resolveDesktopEnvironment(
  source: Record<string, string | undefined>,
  packaged: boolean,
) {
  const input = z
    .string()
    .url()
    .parse(
      source.VELOBASE_DESKTOP_API_ORIGIN ??
        (packaged ? undefined : "http://localhost:3000"),
    );
  const url = new URL(input);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && local && !packaged))
  ) {
    throw new Error(
      "Desktop API origin must be HTTPS (loopback HTTP is allowed in development)",
    );
  }
  return Object.freeze({ apiOrigin: url.origin });
}

export function getDesktopEnvironment(packaged: boolean) {
  return resolveDesktopEnvironment(
    { VELOBASE_DESKTOP_API_ORIGIN: process.env.VELOBASE_DESKTOP_API_ORIGIN },
    packaged,
  );
}
