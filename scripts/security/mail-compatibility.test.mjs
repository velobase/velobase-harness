import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

test("upgraded mail packages preserve reply headers without contacting SMTP", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const sent = await transport.sendMail({
    from: "Harness <sender@example.test>",
    to: "recipient@example.test",
    subject: "CI mail compatibility",
    text: "Local fixture only",
    inReplyTo: "<original@example.test>",
    references: "<original@example.test>",
  });
  const parsed = await simpleParser(sent.message);
  assert.equal(parsed.subject, "CI mail compatibility");
  assert.equal(parsed.text.trim(), "Local fixture only");
  assert.equal(parsed.inReplyTo, "<original@example.test>");
  assert.equal(parsed.references, "<original@example.test>");
});
