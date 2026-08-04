import { createClient } from "npm:@supabase/supabase-js@2";

import {
  constantTimeEqual,
  MAX_BODY_BYTES,
  maskEmail,
  maskMobile,
  normalizeEmail,
  normalizePhilippineMobile,
  NotificationProcessorError,
  parseBoundedInteger,
  renderTemplate,
  validateClaimedJob,
  validateProcessorRequest,
  type ClaimedJob,
} from "./domain.ts";
import {
  createEmailAdapter,
  createSmsAdapter,
  type DeliveryResult,
} from "./providers.ts";

type SupabaseClient = ReturnType<typeof createClient>;

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function environment() {
  const values = Object.fromEntries(
    [
      "EMAIL_PROVIDER",
      "EMAIL_PROVIDER_URL",
      "EMAIL_API_KEY",
      "EMAIL_FROM_ADDRESS",
      "EMAIL_FROM_NAME",
      "EMAIL_REPLY_TO",
      "SMS_PROVIDER",
      "SMS_PROVIDER_URL",
      "SMS_API_KEY",
      "SMS_SENDER_ID",
      "SMS_ENABLED",
    ].map((key) => [key, Deno.env.get(key)]),
  );
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey =
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const processorToken = Deno.env.get("NOTIFICATION_PROCESSOR_TOKEN");
  if (!url || !serviceKey || !processorToken || processorToken.length < 32) {
    throw new NotificationProcessorError(
      "server_configuration_error",
      "The notification processor is not configured.",
      500,
    );
  }
  return {
    url,
    serviceKey,
    processorToken,
    values,
    emailGlobalHourly: parseBoundedInteger(
      Deno.env.get("EMAIL_GLOBAL_HOURLY_LIMIT"),
      100,
      1,
      1000,
    ),
    smsGlobalHourly: parseBoundedInteger(
      Deno.env.get("SMS_GLOBAL_HOURLY_LIMIT"),
      50,
      1,
      500,
    ),
    emailRecipientHourly: parseBoundedInteger(
      Deno.env.get("EMAIL_RECIPIENT_HOURLY_LIMIT"),
      20,
      1,
      100,
    ),
    smsRecipientHourly: parseBoundedInteger(
      Deno.env.get("SMS_RECIPIENT_HOURLY_LIMIT"),
      5,
      1,
      20,
    ),
  };
}

function authorize(request: Request, expectedToken: string) {
  if (request.headers.has("origin")) {
    throw new NotificationProcessorError(
      "browser_invocation_denied",
      "Notification processing is not available from a browser.",
      403,
    );
  }
  const token =
    request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!constantTimeEqual(token, expectedToken)) {
    throw new NotificationProcessorError(
      "service_authorization_required",
      "Notification processing authorization is invalid.",
      401,
    );
  }
}

async function body(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new NotificationProcessorError(
      "payload_too_large",
      "The request is too large.",
      413,
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new NotificationProcessorError(
      "payload_too_large",
      "The request is too large.",
      413,
    );
  }
  if (!text.trim()) return validateProcessorRequest(null);
  try {
    return validateProcessorRequest(JSON.parse(text));
  } catch (error) {
    if (error instanceof NotificationProcessorError) throw error;
    throw new NotificationProcessorError(
      "validation_error",
      "The request body is invalid JSON.",
    );
  }
}

async function verifiedDestination(admin: SupabaseClient, job: ClaimedJob) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, account_status")
    .eq("id", job.recipient_profile_id)
    .maybeSingle();
  if (profileError || !profile || profile.account_status !== "active")
    return null;
  if (profile.role === "resident") {
    const { count, error } = await admin
      .from("residents")
      .select("id", { count: "exact", head: true })
      .eq("linked_profile_id", profile.id)
      .eq("status", "active")
      .is("archived_at", null);
    if (error || count !== 1) return null;
  }
  const { data, error } = await admin.auth.admin.getUserById(
    job.recipient_profile_id,
  );
  if (error || !data.user) return null;
  if (job.channel === "email") {
    const destination = data.user.email_confirmed_at
      ? normalizeEmail(data.user.email)
      : null;
    return destination ? { destination, masked: maskEmail(destination) } : null;
  }
  const destination = data.user.phone_confirmed_at
    ? normalizePhilippineMobile(data.user.phone)
    : null;
  return destination ? { destination, masked: maskMobile(destination) } : null;
}

async function complete(
  admin: SupabaseClient,
  workerId: string,
  job: ClaimedJob,
  result: DeliveryResult,
  latency: number,
  masked: string | null,
) {
  const { error } = await admin.rpc("notification_complete_job", {
    p_job_id: job.id,
    p_worker_id: workerId,
    p_outcome: result.outcome,
    p_latency_ms: Math.min(Math.max(Math.round(latency), 0), 120000),
    p_destination_hint: masked,
    p_provider_reference: result.providerReference,
    p_failure_category: result.category,
  });
  if (error) {
    throw new NotificationProcessorError(
      "job_completion_failed",
      "A notification job could not be finalized safely.",
      503,
    );
  }
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }
    const config = environment();
    authorize(request, config.processorToken);
    const { batchSize } = await body(request);
    const admin = createClient(config.url, config.serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const email = createEmailAdapter(config.values);
    const sms = createSmsAdapter(config.values);
    const { error: statusError } = await admin.rpc(
      "notification_channel_status_set",
      {
        p_email_configured: email.configured,
        p_email_provider: email.label,
        p_sms_configured: sms.configured,
        p_sms_provider: sms.label,
      },
    );
    if (statusError) {
      throw new NotificationProcessorError(
        "queue_unavailable",
        "Notification channel status could not be updated.",
        503,
      );
    }
    const workerId = crypto.randomUUID();
    const { data, error } = await admin.rpc("notification_claim_jobs", {
      p_worker_id: workerId,
      p_batch_size: batchSize,
      p_email_global_hourly: config.emailGlobalHourly,
      p_sms_global_hourly: config.smsGlobalHourly,
      p_email_recipient_hourly: config.emailRecipientHourly,
      p_sms_recipient_hourly: config.smsRecipientHourly,
    });
    if (error || !Array.isArray(data)) {
      throw new NotificationProcessorError(
        "queue_unavailable",
        "Notification jobs could not be claimed.",
        503,
      );
    }

    const results = { claimed: data.length, sent: 0, failed: 0, deferred: 0 };
    for (const rawJob of data) {
      const job = validateClaimedJob(rawJob);
      const started = performance.now();
      const verified = await verifiedDestination(admin, job);
      let delivery: DeliveryResult;
      if (!verified) {
        delivery = {
          outcome: "permanent_failure",
          category: "verified_contact_unavailable",
          providerReference: null,
        };
      } else {
        const template = renderTemplate(job);
        delivery =
          job.channel === "email"
            ? await email.send({
                recipient: verified.destination,
                subject: template.subject,
                text: template.text,
                html: template.html,
                idempotencyKey: job.id,
              })
            : await sms.send({
                recipient: verified.destination,
                message: template.sms,
                idempotencyKey: job.id,
              });
      }
      const latency = performance.now() - started;
      await complete(
        admin,
        workerId,
        job,
        delivery,
        latency,
        verified?.masked ?? null,
      );
      if (delivery.outcome === "sent") results.sent += 1;
      else if (delivery.outcome === "temporary_failure") results.deferred += 1;
      else results.failed += 1;
      console.log("outbound notification result", {
        jobId: job.id,
        eventType: job.event_type,
        channel: job.channel,
        resultCategory: delivery.category ?? delivery.outcome,
        latencyMs: Math.round(latency),
        timestamp: new Date().toISOString(),
      });
    }
    return Response.json(results, {
      status: 200,
      headers: SECURITY_HEADERS,
    });
  } catch (error) {
    const safe =
      error instanceof NotificationProcessorError
        ? error
        : new NotificationProcessorError(
            "processor_failed",
            "Notification processing could not be completed.",
            500,
          );
    console.error("outbound notification processor rejected", {
      code: safe.code,
      timestamp: new Date().toISOString(),
    });
    return Response.json(
      { error: safe.code, message: safe.message },
      {
        status: safe.status,
        headers: SECURITY_HEADERS,
      },
    );
  }
});
