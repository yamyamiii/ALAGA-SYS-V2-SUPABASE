import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationDeliveryDashboard } from "@/features/notifications/NotificationDeliveryDashboard";
import { NotificationPreferencesCard } from "@/features/notifications/NotificationPreferencesCard";
import {
  useNotificationDeliverySummary,
  useNotificationPreferences,
  useNotificationSettingsMutation,
} from "@/features/notifications/hooks";

vi.mock("@/features/notifications/hooks", () => ({
  useNotificationDeliverySummary: vi.fn(),
  useNotificationPreferences: vi.fn(),
  useNotificationSettingsMutation: vi.fn(),
}));

const preference = {
  in_app_enabled: true,
  email_enabled: false,
  sms_enabled: false,
  appointment_updates_enabled: true,
  appointment_reminders_enabled: true,
  announcement_enabled: true,
  inquiry_updates_enabled: true,
  maternal_child_reminders_enabled: true,
  document_updates_enabled: true,
  locale: "en",
  version: 1,
  email_contact_available: true,
  email_destination: "r*******@example.test",
  email_provider_configured: true,
  sms_contact_available: true,
  sms_destination: "+63******567",
  sms_provider_configured: false,
};

describe("notification settings UI", () => {
  const mutateAsync = vi.fn().mockResolvedValue(2);

  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationSettingsMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useNotificationPreferences.mockReturnValue({
      isLoading: false,
      isError: false,
      data: preference,
      refetch: vi.fn(),
    });
  });

  it("renders accessible masked own-preference controls", () => {
    render(<NotificationPreferencesCard />);
    expect(
      screen.getByRole("switch", { name: /in-app notifications/i }),
    ).toBeChecked();
    expect(screen.getByRole("switch", { name: /email/i })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: /sms/i })).toBeDisabled();
    expect(screen.getByText(/r\*+@example\.test/i)).toBeInTheDocument();
    expect(screen.getByText(/\+63\*+567/i)).toBeInTheDocument();
  });

  it("saves changed values without a destination or profile field", async () => {
    render(<NotificationPreferencesCard />);
    fireEvent.click(screen.getByRole("switch", { name: /email/i }));
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ email_enabled: true, version: 1 }),
    );
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("profile_id");
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty(
      "email_destination",
    );
  });

  it("shows only aggregate and masked administrator delivery information", () => {
    useNotificationDeliverySummary.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        counts: { pending: 2, sent: 8, failed: 1, unconfigured: 3 },
        channels: [{ channel: "sms", configured: false }],
        recent: [
          {
            id: "job-1",
            event_type: "appointment_confirmed",
            channel: "email",
            status: "failed",
            destination_hint: "r*******@example.test",
            attempt_count: 5,
            max_attempts: 5,
            manual_retry_count: 0,
            failure_category: "provider_unavailable",
            created_at: "2026-08-03T00:00:00Z",
            version: 3,
          },
        ],
      },
      refetch: vi.fn(),
    });
    render(<NotificationDeliveryDashboard enabled />);
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/r\*+@example\.test/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
