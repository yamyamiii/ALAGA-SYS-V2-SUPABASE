import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NotificationsPage from "@/features/assistance/NotificationsPage";
import {
  useAssistanceMutation,
  useNotifications,
} from "@/features/assistance/hooks";
import { NotificationPreferencesCard } from "@/features/notifications/NotificationPreferencesCard";
import {
  useNotificationPreferences,
  useNotificationSettingsMutation,
} from "@/features/notifications/hooks";
import { useAuth } from "@/features/auth/authContext";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock("@/features/auth/authContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/notifications/hooks", () => ({
  useNotificationPreferences: vi.fn(),
  useNotificationSettingsMutation: vi.fn(),
}));

vi.mock("@/features/assistance/hooks", () => ({
  useAssistanceMutation: vi.fn(),
  useNotifications: vi.fn(),
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
  const markRead = vi.fn();
  const markAllRead = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationSettingsMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useAuth.mockReturnValue({ can: vi.fn().mockReturnValue(true) });
    useNotificationPreferences.mockReturnValue({
      isLoading: false,
      isError: false,
      data: preference,
      refetch: vi.fn(),
    });
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [], total: 0, unread: 0 },
      refetch: vi.fn(),
    });
    useAssistanceMutation.mockReturnValue({
      mutate: markRead,
      mutateAsync: markAllRead,
      isPending: false,
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

  it("shows notifications and preferences without delivery monitoring", () => {
    render(<NotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Unread only")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mark all as read/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /notification preferences/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Appointment updates")).toBeInTheDocument();
    expect(screen.getByText("Appointment reminders")).toBeInTheDocument();
    expect(screen.getByText("Important announcements")).toBeInTheDocument();
    expect(screen.getByText("Inquiry updates")).toBeInTheDocument();
    expect(
      screen.getByText("Signed document availability"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/external delivery status/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/recent delivery jobs/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Unconfigured")).not.toBeInTheDocument();
  });

  it("keeps mark-all and unread-only interactions available", async () => {
    const user = userEvent.setup();
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [], total: 0, unread: 2 },
      refetch: vi.fn(),
    });
    render(<NotificationsPage />);

    await user.click(screen.getByRole("button", { name: /mark all as read/i }));
    expect(markAllRead).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("checkbox", { name: /unread only/i }));
    await waitFor(() =>
      expect(useNotifications).toHaveBeenLastCalledWith(
        expect.objectContaining({ unread_only: true, page: 1 }),
      ),
    );
  });

  it("uses one clickable card and removes separate per-notification actions", () => {
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            id: "notification-one",
            notification_type: "appointment_approved",
            title: "Appointment confirmed",
            summary: "Your appointment was confirmed.",
            action_path: "/appointments",
            available_at: "2026-08-15T03:00:00Z",
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      },
      refetch: vi.fn(),
    });

    render(<NotificationsPage />);

    expect(
      screen.getByRole("button", {
        name: /read and open notification: appointment confirmed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^open$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^mark as read$/i }),
    ).not.toBeInTheDocument();
  });

  it("starts marking an unread appointment notification before navigating", async () => {
    const user = userEvent.setup();
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            id: "notification-one",
            notification_type: "appointment_approved",
            title: "Appointment confirmed",
            summary: "Your appointment was confirmed.",
            action_path: "/appointments",
            available_at: "2026-08-15T03:00:00Z",
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      },
      refetch: vi.fn(),
    });

    render(<NotificationsPage />);
    await user.click(
      screen.getByRole("button", {
        name: /read and open notification: appointment confirmed/i,
      }),
    );

    expect(markRead).toHaveBeenCalledWith(
      "notification-one",
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(markRead.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
    expect(navigate).toHaveBeenCalledWith("/appointments");
  });

  it("opens an already-read announcement without another read mutation", async () => {
    const user = userEvent.setup();
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            id: "notification-two",
            notification_type: "new_announcement",
            title: "Clinic advisory",
            summary: "A new advisory is available.",
            action_path: "/announcements",
            available_at: "2026-08-15T03:00:00Z",
            read_at: "2026-08-15T04:00:00Z",
          },
        ],
        total: 1,
        unread: 0,
      },
      refetch: vi.fn(),
    });

    render(<NotificationsPage />);
    await user.click(
      screen.getByRole("button", {
        name: /open notification: clinic advisory/i,
      }),
    );

    expect(markRead).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/announcements");
  });

  it("marks a no-destination notification without unsafe navigation", async () => {
    const user = userEvent.setup();
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            id: "notification-three",
            notification_type: "maternal_event",
            title: "Care update",
            summary: "A care update is available.",
            action_path: null,
            available_at: "2026-08-15T03:00:00Z",
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      },
      refetch: vi.fn(),
    });

    render(<NotificationsPage />);
    await user.click(
      screen.getByRole("button", {
        name: /mark as read notification: care update/i,
      }),
    );

    expect(markRead).toHaveBeenCalledWith(
      "notification-three",
      expect.any(Object),
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("supports native keyboard activation for the notification card", async () => {
    const user = userEvent.setup();
    useNotifications.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          {
            id: "notification-four",
            notification_type: "new_announcement",
            title: "Health center update",
            summary: "An announcement is available.",
            action_path: "/announcements",
            available_at: "2026-08-15T03:00:00Z",
            read_at: null,
          },
        ],
        total: 1,
        unread: 1,
      },
      refetch: vi.fn(),
    });

    render(<NotificationsPage />);
    const card = screen.getByRole("button", {
      name: /read and open notification: health center update/i,
    });
    card.focus();
    await user.keyboard("{Enter}");

    expect(markRead).toHaveBeenCalledWith(
      "notification-four",
      expect.any(Object),
    );
    expect(navigate).toHaveBeenCalledWith("/announcements");
  });
});
