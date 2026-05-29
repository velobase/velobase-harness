import { LegalLayout } from "@/components/layout/legal-layout";
import { SUPPORT_EMAIL, supportMailto } from "@/config/brand";

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="January 15, 2026">
      <section>
        <h3>1. General Policy</h3>
        <p>
          AI SaaS operates on a credit-based system. Due to the nature of AI video generation, which requires
          significant and irreversible GPU computing resources, <strong>all credit purchases are final and
          non-refundable once credits have been used</strong>.
        </p>
        <p>
          By purchasing credits or subscribing to our service, you acknowledge and agree that:
        </p>
        <ul>
          <li>AI-generated results are inherently unpredictable and may vary in quality</li>
          <li>GPU costs are incurred immediately upon generation, regardless of your satisfaction with the result</li>
          <li>Subjective dissatisfaction with AI output quality does not constitute grounds for a refund</li>
        </ul>
      </section>

      <section>
        <h3>2. Subscriptions</h3>
        <p>
          You may cancel your subscription at any time through your account settings. Cancellation will take effect
          at the end of your current billing period.
        </p>
        <ul>
          <li>
            <strong>No Prorated Refunds:</strong> We do not provide prorated refunds for partial billing periods.
            Once a billing cycle begins, the full amount is charged and non-refundable.
          </li>
          <li>
            <strong>Renewal Charges:</strong> It is your responsibility to cancel before renewal. Refund requests
            for renewal charges will only be considered if: (a) the request is made within 48 hours of the charge,
            AND (b) zero credits from the new billing cycle have been used.
          </li>
          <li>
            <strong>Annual Subscriptions:</strong> Annual subscription purchases are non-refundable after 7 days
            from the purchase date, or if any credits have been used, whichever occurs first.
          </li>
        </ul>
      </section>

      <section>
        <h3>3. Credit Packs (One-Time Purchases)</h3>
        <p>
          Credit pack purchases are final and non-refundable. Refunds will only be considered if:
        </p>
        <ul>
          <li>The request is made within 24 hours of purchase</li>
          <li>No credits from the pack have been used</li>
          <li>This is your first refund request</li>
        </ul>
        <p>
          <strong>Note:</strong> Each account is entitled to a maximum of one (1) courtesy refund. Subsequent
          refund requests for credit packs will not be honored.
        </p>
      </section>

      <section>
        <h3>4. Technical Issues</h3>
        <p>
          We will restore credits <strong>only</strong> in the following verified technical failure scenarios:
        </p>
        <ul>
          <li>
            <strong>Complete Generation Failure:</strong> The system failed to produce any output due to a
            server-side error (not client-side issues such as browser crashes or network disconnection).
          </li>
          <li>
            <strong>Corrupted Output:</strong> The generated video file is completely unplayable or corrupted
            due to a system error (verified by our technical team).
          </li>
        </ul>
        <p>
          The following do <strong>NOT</strong> qualify for refunds or credit restoration:
        </p>
        <ul>
          <li>AI output that does not match your expectations or creative vision</li>
          <li>Artifacts, distortions, or imperfections that are inherent to AI generation</li>
          <li>User error in prompt input, image upload, or settings configuration</li>
          <li>Slow generation times or queue delays</li>
          <li>Browser or client-side technical issues</li>
        </ul>
      </section>

      <section>
        <h3>5. How to Request a Refund</h3>
        <p>
          If you believe you qualify for a refund under this policy, submit your request within{" "}
          <strong>7 days</strong> of the transaction. Requests submitted after 7 days will not be considered.
        </p>
        <ul>
          <li>
            <strong>Email:</strong> <a href={supportMailto()}>{SUPPORT_EMAIL}</a>
          </li>
          <li>
            <strong>Required Information:</strong> Your account email, transaction ID or date, and specific
            reason for the request with supporting evidence (e.g., screenshot of error, generation ID).
          </li>
        </ul>
        <p>
          All refund requests are reviewed at our sole discretion. We reserve the right to deny any request
          that does not meet the criteria outlined in this policy.
        </p>
      </section>

      <section>
        <h3>6. Chargebacks & Disputes</h3>
        <p>
          Filing a chargeback or payment dispute without first contacting us constitutes a violation of these
          terms. If you initiate a chargeback:
        </p>
        <ul>
          <li>Your account will be immediately suspended pending investigation</li>
          <li>All unused credits will be forfeited</li>
          <li>You may be permanently banned from the platform</li>
          <li>We reserve the right to pursue recovery of disputed amounts plus associated fees</li>
        </ul>
        <p>
          Please contact our support team first—we are committed to resolving legitimate issues fairly.
        </p>
      </section>

      <section>
        <h3>7. Fraud & Abuse</h3>
        <p>
          We actively monitor for refund abuse patterns. The following behaviors will result in permanent
          account termination without refund:
        </p>
        <ul>
          <li>Submitting multiple refund requests across accounts</li>
          <li>Creating new accounts to circumvent refund limits</li>
          <li>Providing false or misleading information in refund requests</li>
          <li>Systematically requesting refunds after consuming services</li>
          <li>Any form of payment fraud or unauthorized transactions</li>
        </ul>
      </section>

      <section>
        <h3>8. Policy Updates</h3>
        <p>
          We reserve the right to modify this Refund Policy at any time. Changes will be effective immediately
          upon posting. Your continued use of the service after any changes constitutes acceptance of the
          updated policy.
        </p>
      </section>
    </LegalLayout>
  );
}
