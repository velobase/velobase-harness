import { LegalLayout } from "@/components/layout/legal-layout";
import { SUPPORT_EMAIL, supportMailto } from "@/config/brand";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="December 9, 2025">
      <section>
        <h3>Your Privacy is Our Priority</h3>
        <p>
          At AI SaaS, we operate on a simple principle: <strong>your data is yours</strong>. We believe in transparency and collecting only the absolute minimum required to provide you with high-quality AI video generation.
        </p>
      </section>

      <section>
        <h3>Information Collection & Usage</h3>
        <p>We collect limited information to make the service work for you:</p>
        <ul>
          <li><strong>Identity Data:</strong> Email address for secure login and account recovery.</li>
          <li><strong>Transaction Data:</strong> Payment history and credits balance. Actual payment processing is handled by our payment partners (Telegram, NowPayments)—we never see or store your credit card details.</li>
          <li><strong>Technical Data:</strong> Basic logs (IP address, browser type) to ensure service stability and prevent abuse.</li>
          <li><strong>Product Analytics:</strong> We use privacy-focused analytics tools (such as PostHog) to understand product usage patterns and improve user experience. We do not sell this data to advertisers.</li>
        </ul>
        <p>
          We use cookies solely for essential functions (maintaining your login session) and product analytics. We strictly <strong>do not</strong> use tracking pixels for ad targeting or sell your data to data brokers.
        </p>
      </section>

      <section>
        <h3>Your Creative Content</h3>
        <p>This is the most important part:</p>
        <ul>
          <li><strong>Real-time Processing:</strong> Your uploaded images are processed in real-time and are deleted from our processing servers immediately after generation is complete.</li>
          <li><strong>Video Storage:</strong> Generated videos are stored in your private gallery so you can download them. You have full control to delete them permanently at any time.</li>
          <li><strong>No Training:</strong> We <strong>never</strong> use your uploaded photos or generated videos to train our AI models. Your creativity stays yours.</li>
          <li><strong>No Sharing:</strong> We never sell, rent, or share your personal content with third parties or advertisers.</li>
        </ul>
      </section>

      <section>
        <h3>Data Security</h3>
        <p>
          We employ industry-standard security measures including:
        </p>
        <ul>
          <li>Encryption in transit (TLS 1.3) and at rest (AES-256).</li>
          <li>Strict access controls—only automated systems access your generation requests.</li>
          <li>Regular security audits and vulnerability scanning.</li>
        </ul>
      </section>

      <section>
        <h3>Third-Party Processing</h3>
        <p>
          To provide state-of-the-art video generation, we may utilize trusted cloud infrastructure (like AWS or specialized GPU providers). All providers are vetted for security compliance and are bound by strict data processing agreements that prohibit them from using your data for any purpose other than fulfilling your request.
        </p>
      </section>

      <section>
        <h3>Communication</h3>
        <p>
          We respect your inbox. You will only receive transactional emails (password resets, payment receipts, service alerts). We do not send marketing newsletters without your explicit opt-in, and you can unsubscribe anytime.
        </p>
      </section>

      <section>
        <h3>Your Rights</h3>
        <p>
          You have the right to:
        </p>
        <ul>
          <li>Access the personal data we hold about you.</li>
          <li>Request the correction of inaccurate data.</li>
          <li>Request the complete deletion of your account and all associated data (&quot;Right to be Forgotten&quot;).</li>
          <li>Export your data in a portable format.</li>
        </ul>
      </section>

      <section>
        <h3>Contact & Support</h3>
        <p>
          For any privacy-related questions or data requests, please reach out to our dedicated team at <a href={supportMailto()}>{SUPPORT_EMAIL}</a>. We typically respond within 24 hours.
        </p>
      </section>
    </LegalLayout>
  );
}
