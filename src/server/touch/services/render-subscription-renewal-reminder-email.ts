import { buildManageSubscriptionUrl } from "./utils";
import { APP_NAME } from "@/config/brand";

export function renderSubscriptionRenewalReminderEmail(params: {
  periodEndAtIso: string;
}): { subject: string; text: string; html: string } {
  const manageUrl = buildManageSubscriptionUrl();
  const subject = "Your subscription renews tomorrow";

  const text = [
    "Hi,",
    "",
    "This is a reminder that your subscription is scheduled to renew tomorrow.",
    `Renewal time (approx): ${params.periodEndAtIso}`,
    "",
    `View subscription details: ${manageUrl}`,
    "",
    "If you have any questions, reply to this email.",
    "",
    APP_NAME,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background:#f8fafc; padding:24px;">
    <div style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; border:1px solid #e2e8f0; overflow:hidden;">
      <div style="padding:20px 24px; background:linear-gradient(135deg,#f97316 0%,#dc2626 100%); color:#fff;">
        <div style="font-size:18px; font-weight:700;">${APP_NAME}</div>
        <div style="opacity:.95; margin-top:6px;">Subscription renewal reminder</div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 12px 0; color:#0f172a; font-size:15px;">Hi,</p>
        <p style="margin:0 0 12px 0; color:#334155; font-size:14px; line-height:1.6;">
          This is a reminder that your subscription is scheduled to renew <b>tomorrow</b>.
        </p>
        <p style="margin:0 0 18px 0; color:#64748b; font-size:13px;">
          Renewal time (approx): <code>${params.periodEndAtIso}</code>
        </p>
        <a href="${manageUrl}" style="display:inline-block; padding:12px 16px; background:#0f172a; color:#fff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
          View subscription details
        </a>
        <p style="margin:18px 0 0 0; color:#94a3b8; font-size:12px; line-height:1.6;">
          If you have any questions, just reply to this email.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

