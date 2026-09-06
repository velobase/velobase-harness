import { createApiClient } from "@velobase/api-client";

export function createDesktopApi(apiOrigin: string) {
  return createApiClient(async (path) => {
    const response = await fetch(`${apiOrigin}${path}`, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  });
}
