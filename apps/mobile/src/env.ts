import Constants from "expo-constants";
import { z } from "zod";

// Only public build config crosses into the native JavaScript bundle.
export const mobileEnvironment = z
  .object({ apiOrigin: z.string().url() })
  .parse(Constants.expoConfig?.extra);
