import { LegalLayout } from "@/components/layout/legal-layout";

export default function RefundPolicyPage() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="May 21, 2026">
      <section>
        <h3>1. Template Notice</h3>
        <p>
          This Refund Policy is a template for applications built with Velobase
          Harness. It should be customized before production use to match your
          actual products, prices, payment providers, refund windows,
          consumer-law obligations, and support process.
        </p>
      </section>

      <section>
        <h3>2. General Policy</h3>
        <p>
          The application may sell credit packs, subscriptions, usage-based
          entitlements, digital services, AI-powered features, or other products
          configured by the application owner. Unless the checkout page or
          applicable law says otherwise:
        </p>
        <ul>
          <li>
            Used credits, consumed entitlements, completed usage, and delivered
            digital services are generally non-refundable.
          </li>
          <li>
            Unused credit packs or subscription renewals may be eligible for
            review within the refund windows listed below.
          </li>
          <li>
            Refunds are returned through the original payment processor when
            technically available.
          </li>
          <li>
            Nothing in this policy limits non-waivable rights under applicable
            consumer protection law.
          </li>
        </ul>
      </section>

      <section>
        <h3>3. Payment Processors</h3>
        <p>
          Payments may be processed by third-party providers such as Stripe,
          NowPayments, LemonSqueezy, or other providers configured by the
          application owner. Refund availability, timing, currency conversion,
          blockchain finality, processor fees, and chargeback handling may vary
          by provider.
        </p>
      </section>

      <section>
        <h3>4. Subscriptions</h3>
        <p>
          You may cancel a subscription through account settings or the payment
          provider flow when available. Cancellation generally takes effect at
          the end of the current billing period and prevents future renewals.
        </p>
        <ul>
          <li>
            <strong>No automatic prorated refunds:</strong> Unless required by
            law or expressly stated at checkout, we do not automatically provide
            prorated refunds for partial billing periods.
          </li>
          <li>
            <strong>Renewal charges:</strong> Renewal refund requests may be
            considered if the request is made within forty-eight (48) hours of
            the renewal charge and no credits, entitlements, or paid features
            from the new period have been used.
          </li>
          <li>
            <strong>Annual subscriptions:</strong> Annual subscription refund
            requests may be considered within seven (7) days of purchase if no
            included credits, entitlements, or paid features have been used.
          </li>
        </ul>
      </section>

      <section>
        <h3>5. Credit Packs & One-Time Purchases</h3>
        <p>
          Credit pack and one-time digital purchases are generally final once
          credits or entitlements are used. Refunds may be considered if all of
          the following are true:
        </p>
        <ul>
          <li>
            The request is made within twenty-four (24) hours of purchase.
          </li>
          <li>
            No credits, entitlements, downloads, generated outputs, or paid
            features from the purchase have been used.
          </li>
          <li>
            The request is not part of a pattern of refund abuse, fraud,
            duplicate-account use, or promotion abuse.
          </li>
        </ul>
        <p>
          Courtesy refunds, if offered, are discretionary and may be limited to
          one per account, household, payment method, or related group of
          accounts.
        </p>
      </section>

      <section>
        <h3>6. Technical Issues & Credit Restoration</h3>
        <p>
          We may restore credits, retry a job, or issue a refund when a verified
          server-side technical failure prevents delivery of the purchased
          service. Examples may include:
        </p>
        <ul>
          <li>
            The system charged credits but failed to create or complete the
            requested job due to a server-side error.
          </li>
          <li>
            The system produced an inaccessible, corrupted, or missing output
            due to a verified service error.
          </li>
          <li>
            Duplicate billing occurred for the same order or subscription
            period.
          </li>
        </ul>
        <p>
          The following usually do not qualify for refunds or credit
          restoration:
        </p>
        <ul>
          <li>
            Subjective dissatisfaction with AI outputs or product results.
          </li>
          <li>
            Expected variability, artifacts, limitations, or inaccuracies of AI
            systems.
          </li>
          <li>
            User error, incorrect prompt input, wrong file upload, unsupported
            settings, or accidental purchase.
          </li>
          <li>
            Browser, network, device, wallet, email, or client-side issues
            outside our control.
          </li>
          <li>
            Temporary queue delays, rate limits, maintenance windows, or
            third-party provider outages unless required by law or expressly
            promised in a separate agreement.
          </li>
        </ul>
      </section>

      <section>
        <h3>7. How to Request a Refund</h3>
        <p>
          If you believe you qualify for a refund, submit your request within
          seven (7) days of the transaction unless a different period is
          required by law or stated at checkout.
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:support@example.com">support@example.com</a>
          </li>
          <li>
            <strong>Required information:</strong> Account email, order ID or
            transaction ID, payment provider, purchase date, affected product or
            job ID, and a clear explanation with supporting evidence where
            available.
          </li>
        </ul>
        <p>
          Replace this email address with the application owner&apos;s real
          support contact before production use.
        </p>
      </section>

      <section>
        <h3>8. Chargebacks & Payment Disputes</h3>
        <p>
          Please contact support before initiating a chargeback or payment
          dispute so we can investigate and resolve legitimate issues. If a
          chargeback or dispute is opened, we may temporarily suspend access to
          the affected account, subscription, credits, or orders while the
          processor review is pending.
        </p>
        <p>
          We may deny future purchases, withhold affiliate payouts, reverse
          promotional credits, or close accounts involved in fraud, unauthorized
          payments, refund abuse, duplicate-account abuse, or repeated
          unsupported disputes.
        </p>
      </section>

      <section>
        <h3>9. Fraud & Abuse</h3>
        <p>
          The following behavior may result in denied refunds, credit reversal,
          account suspension, or termination:
        </p>
        <ul>
          <li>Submitting false or misleading refund information.</li>
          <li>
            Opening multiple accounts to obtain repeated refunds, trials,
            promotions, or affiliate rewards.
          </li>
          <li>Consuming credits or services and then claiming non-use.</li>
          <li>
            Using stolen payment methods, unauthorized wallets, compromised
            cards, or fraudulent chargebacks.
          </li>
          <li>
            Coordinated abuse across related accounts, devices, payment methods,
            or referral networks.
          </li>
        </ul>
      </section>

      <section>
        <h3>10. Statutory Rights</h3>
        <p>
          Some jurisdictions provide mandatory cancellation, withdrawal,
          cooling-off, or refund rights that cannot be waived by contract. If
          those laws apply, this policy will be interpreted to preserve those
          rights. Add any required regional notices before launch.
        </p>
      </section>

      <section>
        <h3>11. Policy Updates</h3>
        <p>
          We may update this Refund Policy from time to time. Material changes
          should be communicated through the application, email, or another
          reasonable method. Changes do not retroactively reduce refund rights
          for purchases already made unless permitted by law.
        </p>
      </section>
    </LegalLayout>
  );
}
