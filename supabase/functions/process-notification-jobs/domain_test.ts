import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  escapeHtml,
  maskEmail,
  maskMobile,
  normalizeEmail,
  normalizePhilippineMobile,
  NotificationProcessorError,
  renderTemplate,
  validateClaimedJob,
  type ClaimedJob,
} from "./domain.ts";

const baseJob: ClaimedJob = {
  id: "11111111-1111-4111-8111-111111111111",
  event_type: "appointment_confirmed",
  recipient_profile_id: "22222222-2222-4222-8222-222222222222",
  channel: "email",
  template_key: "appointment_confirmed",
  locale: "en",
  safe_variables: { date: "August 10, 2026", time: "9:00 AM" },
  attempt_number: 1,
};

Deno.test("normalizes and masks verified contact formats", () => {
  assertEquals(
    normalizeEmail(" Resident@Example.com "),
    "resident@example.com",
  );
  assertEquals(normalizePhilippineMobile("0917 123 4567"), "+639171234567");
  assertEquals(normalizePhilippineMobile("+63 917 123 4567"), "+639171234567");
  assertEquals(maskEmail("resident@example.com"), "r*******@example.com");
  assertEquals(maskMobile("09171234567"), "+63******567");
});

Deno.test("renders deterministic English and Filipino safe templates", () => {
  const english = renderTemplate(baseJob);
  const filipino = renderTemplate({ ...baseJob, locale: "fil" });
  assertEquals(english.subject, "ALAGA-SYS Appointment Confirmed");
  assertEquals(english.text.includes("August 10, 2026"), true);
  assertEquals(filipino.text.includes("Nakumpirma"), true);
  assertEquals(english.text.includes("diagnosis"), false);
});

Deno.test("escapes announcement variables in HTML", () => {
  const job: ClaimedJob = {
    ...baseJob,
    event_type: "important_announcement",
    template_key: "important_announcement",
    safe_variables: { title: "<img src=x onerror=alert(1)>" },
  };
  const rendered = renderTemplate(job);
  assertEquals(rendered.html.includes("<img"), false);
  assertEquals(rendered.html.includes("&lt;img"), true);
  assertEquals(escapeHtml("<script>"), "&lt;script&gt;");
});

Deno.test("rejects extra variables and header injection", () => {
  assertThrows(
    () =>
      validateClaimedJob({
        ...baseJob,
        safe_variables: {
          ...baseJob.safe_variables,
          diagnosis: "must never be accepted",
        },
      }),
    NotificationProcessorError,
  );
  assertThrows(
    () =>
      validateClaimedJob({
        ...baseJob,
        safe_variables: {
          date: "August 10, 2026\r\nBcc: x@example.com",
          time: "9:00 AM",
        },
      }),
    NotificationProcessorError,
  );
});
