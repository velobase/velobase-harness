// Expo transforms this file only; imported TypeScript needs its own loader on Node 20.
import "tsx/cjs";
import { createMobileConfig } from "./config.ts";

export default createMobileConfig({
  VELOBASE_MOBILE_ENV: process.env.VELOBASE_MOBILE_ENV,
  VELOBASE_MOBILE_API_ORIGIN: process.env.VELOBASE_MOBILE_API_ORIGIN,
});
