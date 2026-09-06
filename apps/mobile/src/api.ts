import { createApiClient } from "@velobase/api-client";

/** This public slice sends no cookies or tokens. Native auth belongs in this adapter. */
export function createMobileApi(
  apiOrigin: string,
  request: typeof fetch = fetch,
) {
  return createApiClient(async (path) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await request(`${apiOrigin}${path}`, {
        credentials: "omit",
        signal: controller.signal,
      });
      return {
        status: response.status,
        body: (await response.json()) as unknown,
      };
    } finally {
      clearTimeout(timeout);
    }
  });
}
