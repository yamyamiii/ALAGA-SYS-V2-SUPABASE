import {
  normalizeEmail,
  normalizePhilippineMobile,
  PROVIDER_TIMEOUT_MS,
} from "./domain.ts";

export type DeliveryResult = {
  outcome: "sent" | "temporary_failure" | "permanent_failure" | "disabled";
  category: string | null;
  providerReference: string | null;
};

export type EmailMessage = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type SmsMessage = {
  recipient: string;
  message: string;
  idempotencyKey: string;
};

type Fetcher = typeof fetch;

function validEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      return url.toString();
    }
  } catch {
    // Invalid configuration remains disabled.
  }
  return null;
}

function safeReference(response: Response): string | null {
  const value = response.headers.get("x-message-id")?.trim() ?? "";
  return /^[a-z0-9._:-]{1,200}$/i.test(value) ? value : null;
}

async function providerRequest(
  fetcher: Fetcher,
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<DeliveryResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.ok) {
      return {
        outcome: "sent",
        category: null,
        providerReference: safeReference(response),
      };
    }
    if (
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500
    ) {
      return {
        outcome: "temporary_failure",
        category:
          response.status === 429
            ? "provider_rate_limited"
            : "provider_unavailable",
        providerReference: null,
      };
    }
    return {
      outcome: "permanent_failure",
      category: "provider_rejected",
      providerReference: null,
    };
  } catch (error) {
    return {
      outcome: "temporary_failure",
      category:
        error instanceof DOMException && error.name === "AbortError"
          ? "provider_timeout"
          : "provider_unavailable",
      providerReference: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createEmailAdapter(
  environment: Record<string, string | undefined>,
  fetcher: Fetcher = fetch,
) {
  const provider =
    environment.EMAIL_PROVIDER?.trim().toLowerCase() ?? "disabled";
  const endpoint = validEndpoint(environment.EMAIL_PROVIDER_URL);
  const apiKey = environment.EMAIL_API_KEY?.trim();
  const fromAddress = normalizeEmail(environment.EMAIL_FROM_ADDRESS);
  const fromName = environment.EMAIL_FROM_NAME?.trim();
  const replyTo = environment.EMAIL_REPLY_TO
    ? normalizeEmail(environment.EMAIL_REPLY_TO)
    : null;
  const configured =
    provider === "http" &&
    Boolean(
      endpoint &&
      apiKey &&
      fromAddress &&
      fromName &&
      fromName.length <= 100 &&
      !/[\r\n]/.test(fromName) &&
      (!environment.EMAIL_REPLY_TO || replyTo),
    );
  return {
    configured,
    label: configured ? "http" : null,
    async send(message: EmailMessage): Promise<DeliveryResult> {
      const recipient = normalizeEmail(message.recipient);
      if (!configured) {
        return {
          outcome: "disabled",
          category: "email_unconfigured",
          providerReference: null,
        };
      }
      if (!recipient) {
        return {
          outcome: "permanent_failure",
          category: "invalid_email",
          providerReference: null,
        };
      }
      return providerRequest(
        fetcher,
        endpoint!,
        apiKey!,
        {
          to: recipient,
          from: { address: fromAddress, name: fromName },
          reply_to: replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          tracking: false,
        },
        message.idempotencyKey,
      );
    },
  };
}

export function createSmsAdapter(
  environment: Record<string, string | undefined>,
  fetcher: Fetcher = fetch,
) {
  const enabled = environment.SMS_ENABLED?.trim().toLowerCase() === "true";
  const provider = environment.SMS_PROVIDER?.trim().toLowerCase() ?? "disabled";
  const endpoint = validEndpoint(environment.SMS_PROVIDER_URL);
  const apiKey = environment.SMS_API_KEY?.trim();
  const senderId = environment.SMS_SENDER_ID?.trim();
  const configured =
    enabled &&
    provider === "http" &&
    Boolean(
      endpoint && apiKey && senderId && /^[a-z0-9 ._-]{2,20}$/i.test(senderId),
    );
  return {
    configured,
    label: configured ? "http" : null,
    async send(message: SmsMessage): Promise<DeliveryResult> {
      const recipient = normalizePhilippineMobile(message.recipient);
      if (!configured) {
        return {
          outcome: "disabled",
          category: "sms_unconfigured",
          providerReference: null,
        };
      }
      if (!recipient) {
        return {
          outcome: "permanent_failure",
          category: "invalid_mobile",
          providerReference: null,
        };
      }
      if (message.message.length > 320) {
        return {
          outcome: "permanent_failure",
          category: "sms_too_long",
          providerReference: null,
        };
      }
      return providerRequest(
        fetcher,
        endpoint!,
        apiKey!,
        { to: recipient, sender_id: senderId, message: message.message },
        message.idempotencyKey,
      );
    },
  };
}
