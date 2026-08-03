import { describe, expect, it, vi } from "vitest";

import {
  maskEmail,
  maskMobile,
  normalizeEmail,
  normalizePhilippineMobile,
  renderTemplate,
  validateClaimedJob,
} from "../../../supabase/functions/process-notification-jobs/domain.ts";
import {
  createEmailAdapter,
  createSmsAdapter,
} from "../../../supabase/functions/process-notification-jobs/providers.ts";

const baseJob = {
  id: "11111111-1111-4111-8111-111111111111",
  event_type: "appointment_confirmed",
  recipient_profile_id: "22222222-2222-4222-8222-222222222222",
  channel: "email",
  template_key: "appointment_confirmed",
  locale: "en",
  safe_variables: { date: "August 10, 2026", time: "9:00 AM" },
  attempt_number: 1,
};

const emailEnvironment = {
  EMAIL_PROVIDER: "http",
  EMAIL_PROVIDER_URL: "https://gateway.example.test/email",
  EMAIL_API_KEY: "test-key",
  EMAIL_FROM_ADDRESS: "health@example.test",
  EMAIL_FROM_NAME: "ALAGA-SYS",
};

describe("notification Edge domain runtime", () => {
  it("normalizes and masks confirmed contacts", () => {
    expect(normalizeEmail(" Resident@Example.com ")).toBe(
      "resident@example.com",
    );
    expect(normalizePhilippineMobile("0917 123 4567")).toBe("+639171234567");
    expect(maskEmail("resident@example.com")).toBe("r*******@example.com");
    expect(maskMobile("09171234567")).toBe("+63******567");
  });

  it("renders deterministic English and Filipino without clinical detail", () => {
    const english = renderTemplate(baseJob);
    const filipino = renderTemplate({ ...baseJob, locale: "fil" });
    expect(english.subject).toBe("ALAGA-SYS Appointment Confirmed");
    expect(english.text).toContain("August 10, 2026");
    expect(filipino.text).toContain("Nakumpirma");
    expect(`${english.text} ${filipino.text}`).not.toMatch(
      /diagnosis|treatment|vital/i,
    );
  });

  it("escapes HTML and rejects forged variables or header injection", () => {
    const announcement = renderTemplate({
      ...baseJob,
      event_type: "important_announcement",
      template_key: "important_announcement",
      safe_variables: { title: "<img src=x onerror=alert(1)>" },
    });
    expect(announcement.html).not.toContain("<img");
    expect(announcement.html).toContain("&lt;img");
    expect(() =>
      validateClaimedJob({
        ...baseJob,
        safe_variables: { ...baseJob.safe_variables, diagnosis: "forged" },
      }),
    ).toThrow(/invalid template variables/i);
    expect(() =>
      validateClaimedJob({
        ...baseJob,
        safe_variables: {
          date: "August 10\r\nBcc: x@example.com",
          time: "9:00 AM",
        },
      }),
    ).toThrow(/invalid template variables/i);
  });

  it("categorizes email success, rejection, and timeout safely", async () => {
    const successFetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: { "x-message-id": "provider-123" },
      }),
    );
    const message = {
      recipient: "resident@example.test",
      subject: "ALAGA-SYS Update",
      text: "Safe update",
      html: "<p>Safe update</p>",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
    };
    await expect(
      createEmailAdapter(emailEnvironment, successFetch).send(message),
    ).resolves.toMatchObject({
      outcome: "sent",
      providerReference: "provider-123",
    });
    expect(successFetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      message.idempotencyKey,
    );

    const rejectFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 400 }));
    await expect(
      createEmailAdapter(emailEnvironment, rejectFetch).send(message),
    ).resolves.toMatchObject({
      outcome: "permanent_failure",
      category: "provider_rejected",
    });

    const timeoutFetch = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(
      createEmailAdapter(emailEnvironment, timeoutFetch).send(message),
    ).resolves.toMatchObject({
      outcome: "temporary_failure",
      category: "provider_timeout",
    });
  });

  it("keeps SMS disabled without the explicit activation flag", async () => {
    const adapter = createSmsAdapter({
      SMS_ENABLED: "false",
      SMS_PROVIDER: "http",
      SMS_PROVIDER_URL: "https://gateway.example.test/sms",
      SMS_API_KEY: "test-key",
      SMS_SENDER_ID: "ALAGA-SYS",
    });
    expect(adapter.configured).toBe(false);
    await expect(
      adapter.send({
        recipient: "+639171234567",
        message: "ALAGA-SYS safe reminder",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toMatchObject({
      outcome: "disabled",
      category: "sms_unconfigured",
    });
  });
});
