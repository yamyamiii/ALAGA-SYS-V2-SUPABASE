import fs from "node:fs";

import { describe, expect, it } from "vitest";

const index = fs.readFileSync(
  "supabase/functions/process-notification-jobs/index.ts",
  "utf8",
);
const domain = fs.readFileSync(
  "supabase/functions/process-notification-jobs/domain.ts",
  "utf8",
);
const providers = fs.readFileSync(
  "supabase/functions/process-notification-jobs/providers.ts",
  "utf8",
);
const combined = `${index}\n${domain}\n${providers}`;

describe("outbound notification Edge Function safety", () => {
  it("uses the supported Supabase Edge SDK and a dedicated processor token", () => {
    expect(index).toContain("npm:@supabase/supabase-js@2");
    expect(index).toContain("NOTIFICATION_PROCESSOR_TOKEN");
    expect(index).toMatch(/constantTimeEqual/i);
    expect(index).toMatch(/auth\.admin\.getUserById/i);
  });

  it("denies browser origins and never accepts a browser recipient", () => {
    expect(index).toMatch(/request\.headers\.has\("origin"\)/i);
    expect(index).toMatch(/not available from a browser/i);
    expect(combined).not.toMatch(/body\.(?:recipient|email|phone|message)/i);
  });

  it("keeps SMS disabled until every explicit setting is present", () => {
    expect(providers).toMatch(/SMS_ENABLED.*=== "true"/i);
    expect(providers).toMatch(/environment\.SMS_PROVIDER/i);
    expect(providers).toMatch(/provider === "http"/i);
    expect(providers).toMatch(/sms_unconfigured/i);
  });

  it("uses escaped localized allowlisted templates", () => {
    expect(domain).toMatch(/escapeHtml/i);
    expect(domain).toMatch(/appointment_request_received/i);
    expect(domain).toMatch(/appointment_confirmed/i);
    expect(domain).toMatch(/signed_document_available/i);
    expect(domain).toMatch(/locale === "fil"/i);
    expect(domain).toMatch(/Object\.keys\(variables\)/i);
    expect(domain).not.toMatch(
      /chief complaint|diagnosis|treatment plan|vital signs/i,
    );
  });

  it("does not log provider secrets, full contacts, or message bodies", () => {
    const operationalLog = index.slice(
      index.indexOf('console.log("outbound notification result"'),
      index.indexOf("return Response.json(results"),
    );
    expect(operationalLog).not.toMatch(
      /recipientProfileId|maskedDestination|destination/i,
    );
    expect(index).not.toMatch(
      /console\.(?:log|warn|error)\([^;]*(?:apiKey|serviceKey|processorToken)/i,
    );
    expect(index).not.toMatch(
      /console\.(?:log|warn|error)\([^;]*(?:template\.text|template\.html|template\.sms)/i,
    );
    expect(combined).not.toMatch(/VITE_(?:EMAIL|SMS|SUPABASE_SECRET)/i);
  });

  it("uses bounded timeouts, batches, and idempotency keys", () => {
    expect(index).toMatch(/batch_size/i);
    expect(providers).toMatch(/Idempotency-Key/i);
    expect(providers).toMatch(/AbortController/i);
    expect(providers).toMatch(/PROVIDER_TIMEOUT_MS/i);
    expect(domain).toMatch(/Number\(batchSize\) > 50/i);
  });
});
