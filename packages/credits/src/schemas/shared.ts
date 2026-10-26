import { z } from "zod";

export const BillingSourceSchema = z.string().trim().min(1).max(255);

export const BillingBusinessTypeSchema = z.enum([
  "UNDEFINED",
  "TASK",
  "ORDER",
  "MEMBERSHIP",
  "SUBSCRIPTION",
  "FREE_TRIAL",
  "ADMIN_GRANT",
  "TOKEN_USAGE",
]);
