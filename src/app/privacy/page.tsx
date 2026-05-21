import { LegalLayout } from "@/components/layout/legal-layout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="May 21, 2026">
      <section>
        <h3>1. Template Notice</h3>
        <p>
          This Privacy Policy is a template for applications built with Velobase
          Harness. It is designed to reflect the framework&apos;s default
          modules, but it must be reviewed and customized before production use.
          Replace the placeholders, remove modules you do not use, add providers
          you do use, and confirm that the policy matches your actual data flows
          and target jurisdictions.
        </p>
      </section>

      <section>
        <h3>2. Information We May Collect</h3>
        <p>
          Depending on the enabled modules, the application may collect and
          process the following categories of information:
        </p>
        <ul>
          <li>
            <strong>Account data:</strong> Email address, name, avatar,
            authentication provider identifiers, password hash where password
            login is enabled, session records, account status, and
            administrative flags.
          </li>
          <li>
            <strong>Profile and preference data:</strong> Timezone, country or
            region, language, notification preferences, subscription
            preferences, and payment gateway preference.
          </li>
          <li>
            <strong>Billing data:</strong> Orders, payments, invoices,
            subscription status, credit balances, product entitlements, refund
            records, payment gateway customer IDs, transaction IDs, and related
            ledger entries.
          </li>
          <li>
            <strong>AI and product data:</strong> Prompts, chat messages,
            projects, uploaded files, generated assets, agent configuration, and
            related metadata when those product modules are enabled.
          </li>
          <li>
            <strong>Support and communication data:</strong> Support tickets,
            email delivery status, unsubscribe preferences, service notices, and
            messages you send to support.
          </li>
          <li>
            <strong>Technical and security data:</strong> IP address, user
            agent, device key or browser fingerprint signals, rate-limit events,
            abuse-prevention signals, logs, error reports, and security audit
            data.
          </li>
          <li>
            <strong>Attribution and analytics data:</strong> UTM parameters,
            referral codes, landing path, referrer host, first-touch timestamp,
            ad click IDs such as gclid, wbraid, gbraid or similar identifiers,
            product events, and feature usage data.
          </li>
        </ul>
      </section>

      <section>
        <h3>3. How We Use Information</h3>
        <p>We use information to:</p>
        <ul>
          <li>Provide, secure, maintain, and troubleshoot the service.</li>
          <li>
            Create and manage accounts, sessions, subscriptions, credits,
            purchases, refunds, and entitlements.
          </li>
          <li>
            Process AI requests, product workflows, uploads, messages, generated
            content, and support conversations.
          </li>
          <li>
            Detect fraud, payment abuse, spam, automated signup abuse, policy
            violations, and security threats.
          </li>
          <li>
            Send transactional emails such as login links, receipts, service
            alerts, support replies, and account notices.
          </li>
          <li>
            Measure product usage, attribution, advertising effectiveness,
            affiliate performance, and conversion events.
          </li>
          <li>
            Comply with legal, tax, accounting, sanctions, dispute, and
            law-enforcement obligations.
          </li>
        </ul>
      </section>

      <section>
        <h3>4. Cookies, Analytics & Advertising Attribution</h3>
        <p>
          The application may use cookies and similar technologies for login
          sessions, security, preferences, analytics, referrals, and advertising
          attribution. Examples include session cookies, cookie-consent records,
          UTM cookies, referral cookies, landing-page metadata, and advertising
          click identifiers.
        </p>
        <p>
          Analytics and advertising integrations may include PostHog, Google
          Ads, X/Twitter Pixel, PropellerAds, or similar services configured by
          the application owner. In regions where consent is required,
          non-essential analytics and advertising scripts should only run after
          valid consent. The framework includes consent-gating support, but each
          deployment must be reviewed against local requirements.
        </p>
      </section>

      <section>
        <h3>5. Payment Processing</h3>
        <p>
          Payments may be handled by third-party payment processors such as
          Stripe, NowPayments, LemonSqueezy, or other providers configured by
          the application owner. We may store payment status, gateway customer
          IDs, transaction IDs, order records, subscription metadata, and credit
          balances, but we do not store full credit card numbers.
        </p>
      </section>

      <section>
        <h3>6. AI Providers & User Content</h3>
        <p>
          If AI features are enabled, prompts, messages, files, generated
          outputs, and related metadata may be sent to configured AI providers
          or infrastructure providers to fulfill your request. Providers may
          include OpenAI, Anthropic, Google, xAI, OpenRouter, self-hosted
          models, GPU providers, object storage, queues, or other services
          selected by the application owner.
        </p>
        <p>
          The framework does not require using customer content to train models
          by default. However, third-party provider data-use rules vary. Review
          your AI providers&apos; terms and configure data retention, training
          opt-outs, enterprise settings, or data processing agreements where
          needed.
        </p>
      </section>

      <section>
        <h3>7. Third-Party Services</h3>
        <p>
          We may share information with service providers that help operate the
          application, including:
        </p>
        <ul>
          <li>
            Hosting, database, Redis, queue, storage, logging, and
            infrastructure providers.
          </li>
          <li>
            Authentication, email, notification, support, and messaging
            providers.
          </li>
          <li>
            Payment processors, tax, accounting, fraud-prevention, and
            chargeback services.
          </li>
          <li>
            Analytics, advertising, attribution, affiliate, and
            conversion-measurement providers.
          </li>
          <li>AI model, API, GPU, and content-processing providers.</li>
          <li>
            Professional advisors, law enforcement, regulators, or courts where
            required by law.
          </li>
        </ul>
      </section>

      <section>
        <h3>8. Marketing & Communications</h3>
        <p>
          We may send transactional messages related to login, security,
          purchases, subscriptions, product changes, support, and legal notices.
          Marketing or newsletter emails should only be sent where permitted by
          law and with an unsubscribe option. You can manage available email
          preferences through the unsubscribe page or account settings.
        </p>
      </section>

      <section>
        <h3>9. Data Retention & Account Deletion</h3>
        <p>
          We retain information for as long as needed to provide the service,
          maintain security, resolve disputes, comply with legal and accounting
          obligations, preserve backups, enforce agreements, and prevent abuse.
          Retention periods vary by data type and product configuration.
        </p>
        <p>
          A self-service account deletion request may first block the account
          and invalidate active sessions while the application owner completes
          deletion or retention workflows. Some records may be retained where
          required for tax, accounting, fraud prevention, chargeback defense,
          security, compliance, or legal reasons. Backups may take additional
          time to expire.
        </p>
      </section>

      <section>
        <h3>10. Your Rights</h3>
        <p>Depending on where you live, you may have the right to:</p>
        <ul>
          <li>Access, correct, export, or delete personal data.</li>
          <li>Object to or restrict certain processing.</li>
          <li>Withdraw consent where processing is based on consent.</li>
          <li>
            Opt out of marketing communications or certain analytics and
            advertising uses.
          </li>
          <li>Appeal or complain to a data protection authority.</li>
        </ul>
        <p>
          Requests can be made using available account tools or by contacting
          support. We may need to verify your identity before acting on a
          request.
        </p>
      </section>

      <section>
        <h3>11. Legal Bases for Processing</h3>
        <p>
          Where laws such as the GDPR apply, we may process personal data based
          on contract necessity, legitimate interests, consent, legal
          obligations, or protection of vital interests. The applicable legal
          basis depends on the feature, jurisdiction, and configuration of the
          deployed application.
        </p>
      </section>

      <section>
        <h3>12. International Transfers</h3>
        <p>
          Your information may be processed in countries other than where you
          live. Where required, the application owner should use appropriate
          transfer safeguards, such as data processing agreements, standard
          contractual clauses, regional hosting, or equivalent protections.
        </p>
      </section>

      <section>
        <h3>13. Security</h3>
        <p>
          We use technical and organizational safeguards designed to protect
          information, including access controls, encrypted transport, secure
          authentication, rate limits, logging, and administrative controls. No
          system is completely secure, and each deployment is responsible for
          configuring secrets, infrastructure, storage, provider permissions,
          backups, and operational security correctly.
        </p>
      </section>

      <section>
        <h3>14. Children</h3>
        <p>
          This template is not intended for products directed to children. If
          your product is available to minors, add age limits, parental consent
          flows, child-safety disclosures, and any required regional notices
          before launch.
        </p>
      </section>

      <section>
        <h3>15. Contact</h3>
        <p>
          Privacy questions and data requests should be sent to{" "}
          <a href="mailto:support@example.com">support@example.com</a>. Replace
          this address with the application owner&apos;s real privacy or support
          contact before production use.
        </p>
      </section>
    </LegalLayout>
  );
}
