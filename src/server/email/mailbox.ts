/** Low-level mailbox transport; auth email and outreach keep their own providers. */
import { sendMailboxEmail, type OutgoingEmail } from "@velobase/mailbox";
import { getMailboxConfig } from "@/server/features/connections";
export async function sendEmail(message: OutgoingEmail) {
  const config = await getMailboxConfig();
  if (!config) throw new Error("Mailbox is not configured");
  return sendMailboxEmail(config, message);
}
