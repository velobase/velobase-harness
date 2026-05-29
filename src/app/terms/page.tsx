import { LegalLayout } from "@/components/layout/legal-layout";
import { SUPPORT_EMAIL, supportMailto } from "@/config/brand";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" lastUpdated="January 15, 2026">
      <section>
        <h3>1. Introduction</h3>
        <p>
          Welcome to AI SaaS (&quot;Company&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). By accessing or using our website and services, you agree to be bound by these Terms of Service. Our goal is to provide a creative, safe, and transparent platform for AI video generation.
        </p>
      </section>

      <section>
        <h3>2. Service Provider</h3>
        <p>
          AI SaaS is an AI video generation service. By using our platform, you agree to the terms and conditions set forth herein.
        </p>
      </section>

      <section>
        <h3>3. Ownership & Rights</h3>
        <p>We believe creators should own their work.</p>
        <ul>
          <li><strong>You Own Your Inputs:</strong> You retain all rights to the images and prompts you upload.</li>
          <li><strong>You Own Your Outputs:</strong> Subject to applicable law, you own the videos you generate using AI SaaS.</li>
          <li><strong>Commercial Use:</strong> You are granted a worldwide, non-exclusive, royalty-free license to use your generated videos for commercial purposes (e.g., social media ads, YouTube, marketing materials).</li>
          <li><strong>Platform License:</strong> You grant AI SaaS a limited license to process your content solely for the purpose of generating your requested videos and displaying them in your private history.</li>
        </ul>
      </section>

      <section>
        <h3>4. Acceptable Use Policy</h3>
        <p>To keep AI SaaS safe for everyone, you agree not to generate content that includes:</p>
        <ul>
          <li><strong>Harmful Content:</strong> Hate speech, violence, harassment, or promotion of illegal acts.</li>
          <li><strong>Adult & NSFW Content:</strong> Sexually explicit, pornographic, or adult-only content is prohibited. Our platform employs automated content moderation systems. Any deliberate attempt to bypass, circumvent, or manipulate these safeguards—including but not limited to prompt engineering, obfuscated language, or adversarial inputs—constitutes a separate violation of these Terms and may result in immediate account termination.</li>
          <li><strong>Sexual Violence & Non-Consensual Content:</strong> Any content depicting sexual violence or non-consensual sexual acts (including &quot;deepfakes&quot;) is strictly prohibited and will be reported to authorities.</li>
          <li><strong>CSAM:</strong> Child Sexual Abuse Material is zero-tolerance. We automatically scan for hash matches and report to NCMEC.</li>
          <li><strong>Infringement:</strong> Content that violates the intellectual property or privacy rights of others.</li>
        </ul>
        <p>
          Violation of these policies will result in immediate account termination without refund.
        </p>
      </section>

      <section>
        <h3>5. Credits, Payments & Refunds</h3>
        <ul>
          <li><strong>Credits & Expiration:</strong> Our service uses a credit-based system.
            <ul>
              <li><strong>Subscription Credits:</strong> Credits granted as part of a monthly subscription reset at the beginning of each billing cycle. Unused subscription credits do not roll over.</li>
              <li><strong>One-time Packs:</strong> Credits purchased as one-time &quot;add-on&quot; packs do not expire as long as your account remains active.</li>
            </ul>
          </li>
          <li><strong>Credit Consumption:</strong> Credits are consumed at the time of generation request, not upon completion. Once a generation is initiated, credits cannot be restored regardless of the outcome.</li>
          <li><strong>Payment Processing:</strong> Payments are securely processed by our third-party payment processors (Telegram Stars or cryptocurrency). We do not store full credit card numbers or sensitive financial information.</li>
          <li>
            <strong>Refund Policy:</strong> All purchases are final and non-refundable except as explicitly stated in our{" "}
            <a href="/refund-policy">Refund Policy</a>. By making a purchase, you acknowledge that AI generation services
            involve irreversible computational costs and that subjective dissatisfaction with output quality does not
            entitle you to a refund.
          </li>
        </ul>
      </section>

      <section>
        <h3>6. Service Availability & Quality</h3>
        <p>
          <strong>AI Disclaimer:</strong> Artificial Intelligence is an evolving technology. AI-generated results are
          inherently unpredictable and may contain artifacts, distortions, or unexpected outputs.{" "}
          <strong>You expressly acknowledge and accept that:</strong>
        </p>
        <ul>
          <li>Generated videos may not match your expectations or creative vision</li>
          <li>Results can vary significantly even with identical inputs</li>
          <li>We make no guarantees regarding the quality, accuracy, or fitness for any particular purpose of generated content</li>
          <li>Imperfect outputs are an inherent characteristic of AI technology, not a defect in service</li>
        </ul>
        <p>
          <strong>Service Provided &quot;As Is&quot;:</strong> The service is provided on an &quot;as is&quot; and &quot;as available&quot;
          basis without warranties of any kind, either express or implied, including but not limited to implied
          warranties of merchantability, fitness for a particular purpose, or non-infringement.
        </p>
        <p>
          <strong>Uptime:</strong> We aim for 99.9% uptime, but we do not guarantee uninterrupted access during
          scheduled maintenance or unforeseen outages. Service interruptions do not entitle users to refunds or credits.
        </p>
      </section>

      <section>
        <h3>7. Limitation of Liability</h3>
        <p>
          To the maximum extent permitted by law, AI SaaS shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly,
          or any loss of data, use, goodwill, or other intangible losses.
        </p>
        <p>
          <strong>In no event shall our total liability to you for all claims exceed the amount you paid to us in the
          thirty (30) days immediately preceding the claim.</strong>
        </p>
        <p>
          You agree that the limitations of liability set forth in this section are fundamental elements of the basis
          of the bargain between you and us, and that we would not provide the service without such limitations.
        </p>
      </section>

      <section>
        <h3>8. Indemnification</h3>
        <p>
          You agree to indemnify, defend, and hold harmless AI SaaS, its affiliates, officers, directors, employees,
          and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including
          reasonable attorneys&apos; fees) arising out of or relating to:
        </p>
        <ul>
          <li>Your use of the service</li>
          <li>Your violation of these Terms</li>
          <li>Your violation of any rights of any third party</li>
          <li>Any content you upload or generate using the service</li>
        </ul>
      </section>

      <section>
        <h3>9. Account Termination</h3>
        <p>
          We reserve the right to suspend or terminate your account at any time, with or without notice, for any reason,
          including but not limited to:
        </p>
        <ul>
          <li>Violation of these Terms or any applicable policies</li>
          <li>Fraudulent, abusive, or illegal activity</li>
          <li>Refund abuse or chargeback disputes</li>
          <li>Creating multiple accounts to circumvent restrictions</li>
        </ul>
        <p>
          Upon termination, you forfeit all unused credits and any right to refunds. We are not liable to you or any
          third party for any termination of your access to the service.
        </p>
      </section>

      <section>
        <h3>10. Governing Law & Jurisdiction</h3>
        <p>
          These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising from these Terms shall be resolved in accordance with the applicable jurisdiction.
        </p>
      </section>

      <section>
        <h3>11. Dispute Resolution</h3>
        <p>
          Before initiating any legal proceeding, you agree to first contact us at{" "}
          <a href={supportMailto()}>{SUPPORT_EMAIL}</a> and attempt to resolve the dispute informally
          for at least thirty (30) days. Filing a chargeback or payment dispute without first attempting informal
          resolution is a material breach of these Terms.
        </p>
      </section>

      <section>
        <h3>12. Changes to Terms</h3>
        <p>
          We reserve the right to modify these Terms at any time. We will notify users of material changes by posting
          a notice on our website or sending an email. Your continued use of the service after any changes constitutes
          acceptance of the new Terms.
        </p>
      </section>

      <section>
        <h3>13. Contact Us</h3>
        <p>
          If you have any questions about these Terms, please contact us at <a href={supportMailto()}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>
    </LegalLayout>
  );
}
