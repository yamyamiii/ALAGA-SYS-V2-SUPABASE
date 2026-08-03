import { describe, expect, it, vi } from "vitest";

import {
  NotificationServiceError,
  createNotificationService,
} from "@/services/notificationService";

function serviceWith(data = {}) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return { rpc, service: createNotificationService(() => ({ rpc })) };
}

describe("notification service", () => {
  it("loads only the authenticated user's preferences without a profile argument", async () => {
    const { rpc, service } = serviceWith({ in_app_enabled: true });
    await service.getPreferences();
    expect(rpc).toHaveBeenCalledWith("notification_preferences_get", {});
  });

  it("submits a complete bounded preference contract without a recipient", async () => {
    const { rpc, service } = serviceWith(2);
    const values = {
      in_app_enabled: true,
      email_enabled: true,
      sms_enabled: false,
      appointment_updates_enabled: true,
      appointment_reminders_enabled: true,
      announcement_enabled: false,
      inquiry_updates_enabled: true,
      maternal_child_reminders_enabled: false,
      document_updates_enabled: true,
      locale: "fil",
      version: 1,
      profile_id: "browser-supplied-value",
    };
    await service.updatePreferences(values);
    expect(rpc).toHaveBeenCalledWith("notification_preferences_update", {
      p_in_app_enabled: true,
      p_email_enabled: true,
      p_sms_enabled: false,
      p_appointment_updates_enabled: true,
      p_appointment_reminders_enabled: true,
      p_announcement_enabled: false,
      p_inquiry_updates_enabled: true,
      p_maternal_child_reminders_enabled: false,
      p_document_updates_enabled: true,
      p_locale: "fil",
      p_expected_version: 1,
    });
  });

  it("uses optimistic job versions for bounded administrator retries", async () => {
    const { rpc, service } = serviceWith(4);
    await service.retryFailedJob({
      id: "job-id",
      version: 3,
      message: "ignored",
    });
    expect(rpc).toHaveBeenCalledWith("notification_retry_failed_job", {
      p_job_id: "job-id",
      p_expected_version: 3,
    });
  });

  it("maps authorization failures without exposing database text", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "internal permission context" },
    });
    const service = createNotificationService(() => ({ rpc }));
    await expect(service.getDeliverySummary()).rejects.toEqual(
      expect.objectContaining({
        code: "permission_denied",
        message:
          "You do not have permission to complete this notification action.",
      }),
    );
  });

  it("blocks preference writes while offline", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      const { rpc, service } = serviceWith();
      await expect(service.updatePreferences({})).rejects.toBeInstanceOf(
        NotificationServiceError,
      );
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(navigator, "onLine", descriptor);
      else delete navigator.onLine;
    }
  });
});
