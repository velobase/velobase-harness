import { createVelobaseClient } from "@velobase/credits-velobase";
import { env } from "@/env";
let client: ReturnType<typeof createVelobaseClient> | undefined;
/** Compatibility provider entry. Business code uses the credits service. */
export function getVelobase() {
  if (!env.VELOBASE_API_KEY)
    throw new Error("VELOBASE_API_KEY is not configured");
  return (client ??= createVelobaseClient(env.VELOBASE_API_KEY));
}
