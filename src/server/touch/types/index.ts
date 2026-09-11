export type TouchChannel = "EMAIL" | "SMS" | "PUSH";

export type TouchScheduleStatus =
  | "UNKNOWN"
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "CANCELLED"
  | "SUPERSEDED"
  | "FAILED";

export type TouchRecordStatus =
  | "UNKNOWN"
  | "SENT"
  | "DELIVERED"
  | "DELIVERY_DELAYED"
  | "BOUNCED"
  | "COMPLAINED"
  | "OPENED"
  | "CLICKED"
  | "FAILED";

export type TouchReferenceType = "SUBSCRIPTION_CYCLE" | "OUTREACH";
