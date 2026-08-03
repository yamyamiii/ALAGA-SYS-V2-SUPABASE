import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { createEmailAdapter, createSmsAdapter } from "./providers.ts";

const emailEnvironment = {
  EMAIL_PROVIDER: "http",
  EMAIL_PROVIDER_URL: "https://gateway.example.test/email",
  EMAIL_API_KEY: "test-key",
  EMAIL_FROM_ADDRESS: "health@example.test",
  EMAIL_FROM_NAME: "ALAGA-SYS",
};

Deno.test("email adapter is disabled safely when unconfigured", async () => {
  const adapter = createEmailAdapter({});
  assertEquals(adapter.configured, false);
  const result = await adapter.send({
    recipient: "resident@example.test",
    subject: "ALAGA-SYS Update",
    text: "Safe message",
    html: "<p>Safe message</p>",
    idempotencyKey: "job-1",
  });
  assertEquals(result.outcome, "disabled");
});

Deno.test(
  "email adapter categorizes success, failure, and timeout",
  async () => {
    const success = createEmailAdapter(emailEnvironment, (() =>
      Promise.resolve(
        new Response(null, {
          status: 202,
          headers: { "x-message-id": "provider-123" },
        }),
      )) as typeof fetch);
    const sent = await success.send({
      recipient: "resident@example.test",
      subject: "ALAGA-SYS Update",
      text: "Safe message",
      html: "<p>Safe message</p>",
      idempotencyKey: "job-1",
    });
    assertEquals(sent.outcome, "sent");
    assertEquals(sent.providerReference, "provider-123");

    const rejected = createEmailAdapter(emailEnvironment, (() =>
      Promise.resolve(new Response(null, { status: 400 }))) as typeof fetch);
    assertEquals(
      (
        await rejected.send({
          recipient: "resident@example.test",
          subject: "ALAGA-SYS Update",
          text: "Safe message",
          html: "<p>Safe message</p>",
          idempotencyKey: "job-2",
        })
      ).outcome,
      "permanent_failure",
    );

    const timedOut = createEmailAdapter(emailEnvironment, (() =>
      Promise.reject(
        new DOMException("aborted", "AbortError"),
      )) as typeof fetch);
    const timeout = await timedOut.send({
      recipient: "resident@example.test",
      subject: "ALAGA-SYS Update",
      text: "Safe message",
      html: "<p>Safe message</p>",
      idempotencyKey: "job-3",
    });
    assertEquals(timeout.category, "provider_timeout");
  },
);

Deno.test(
  "SMS remains disabled unless every explicit control is configured",
  async () => {
    const adapter = createSmsAdapter({
      SMS_ENABLED: "false",
      SMS_PROVIDER: "http",
      SMS_PROVIDER_URL: "https://gateway.example.test/sms",
      SMS_API_KEY: "test-key",
      SMS_SENDER_ID: "ALAGA-SYS",
    });
    assertEquals(adapter.configured, false);
    const result = await adapter.send({
      recipient: "+639171234567",
      message: "ALAGA-SYS safe reminder",
      idempotencyKey: "job-4",
    });
    assertEquals(result.category, "sms_unconfigured");
  },
);
