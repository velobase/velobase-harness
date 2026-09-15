import { z } from "zod";

export const BillingSourceSchema = z.string().min(1);

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
