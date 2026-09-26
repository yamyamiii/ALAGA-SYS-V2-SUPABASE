import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AnnouncementsPage from "@/features/assistance/AnnouncementsPage";
import {
  useAnnouncements,
  useAssistanceMutation,
} from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { hasPermission, USER_ROLES } from "@/features/auth/permissions";

vi.mock("@/features/assistance/hooks", () => ({
  useAnnouncements: vi.fn(),
  useAssistanceMutation: vi.fn(),
}));

vi.mock("@/features/auth/authContext", () => ({
  useAuth: vi.fn(),
}));

const announcement = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Health center schedule",
  category: "advisory",
  content: "The health center will follow its posted schedule.",
  publish_at: "2026-08-15T00:00:00Z",
  event_start_at: null,
  event_end_at: null,
  expires_at: null,
  is_pinned: false,
  creator_name: "Authorized Staff",
  archived_at: null,
  version: 4,
};

const scheduledAnnouncement = {
  ...announcement,
  id: "22222222-2222-4222-8222-222222222222",
  title: "Scheduled advisory",
  publish_at: "2099-08-16T01:30:00Z",
  event_start_at: "2099-08-17T05:45:00Z",
  event_end_at: "2099-08-17T07:00:00Z",
};

const expiredAnnouncement = {
  ...announcement,
  id: "33333333-3333-4333-8333-333333333333",
  title: "Expired advisory",
  publish_at: "2020-08-13T00:00:00Z",
  expires_at: "2020-08-14T00:00:00Z",
};

const archivedAnnouncement = {
  ...announcement,
  id: "44444444-4444-4444-8444-444444444444",
  title: "Archived advisory",
  archived_at: "2026-08-14T00:00:00Z",
};

describe("announcement management actions", () => {
  const mutateAsync = vi.fn().mockResolvedValue(5);

  beforeEach(() => {
    vi.clearAllMocks();
    useAnnouncements.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [announcement], total: 1 },
      refetch: vi.fn(),
    });
    useAssistanceMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
  });

  function renderFor(role) {
    useAuth.mockReturnValue({
      can: (permission) => hasPermission(role, permission),
      profile: { role },
    });
    return render(<AnnouncementsPage />);
  }

  it.each([
    ["Administrator", USER_ROLES.ADMINISTRATOR],
    ["BHW", USER_ROLES.BARANGAY_HEALTH_WORKER],
  ])("shows Archive to %s", (_label, role) => {
    renderFor(role);
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Show archived" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit or pin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create announcement" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["Administrator", USER_ROLES.ADMINISTRATOR],
    ["BHW", USER_ROLES.BARANGAY_HEALTH_WORKER],
  ])("shows clear lifecycle badges to %s", (_label, role) => {
    useAnnouncements.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        items: [
          announcement,
          scheduledAnnouncement,
          expiredAnnouncement,
          archivedAnnouncement,
        ],
        total: 4,
      },
      refetch: vi.fn(),
    });

    renderFor(role);

    for (const status of ["Published", "Scheduled", "Expired", "Archived"]) {
      expect(screen.getByText(status, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByText(/Aug 17, 2099, 1:45 PM/i)).toBeInTheDocument();
    expect(screen.getByText(/Aug 17, 2099, 3:00 PM/i)).toBeInTheDocument();
    expect(screen.getByText("Publishes:")).toBeInTheDocument();
    expect(screen.getAllByText("Event:")).toHaveLength(1);
  });

  it("requests the manager list without using archived mode to reveal scheduled rows", () => {
    renderFor(USER_ROLES.ADMINISTRATOR);
    expect(useAnnouncements).toHaveBeenCalledWith(
      expect.objectContaining({ include_archived: false }),
    );
  });

  it.each([
    ["Nurse", USER_ROLES.NURSE],
    ["Midwife", USER_ROLES.MIDWIFE],
    ["Resident", USER_ROLES.RESIDENT],
  ])("keeps %s read-only", (_label, role) => {
    renderFor(role);
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(
      screen.queryByRole("checkbox", { name: "Show archived" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit or pin" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create announcement" }),
    ).toBeNull();
  });

  it.each([
    ["Administrator", USER_ROLES.ADMINISTRATOR],
    ["BHW", USER_ROLES.BARANGAY_HEALTH_WORKER],
  ])("requires %s to confirm before archiving", async (_label, role) => {
    const user = userEvent.setup();
    renderFor(role);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Archive announcement?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This announcement will no longer be visible to users, but it will remain available in archived records.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Archive announcement" }),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      id: announcement.id,
      version: announcement.version,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Archive announcement?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("cancels without invoking the archive RPC", async () => {
    const user = userEvent.setup();
    renderFor(USER_ROLES.ADMINISTRATOR);

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Archive announcement?" }),
    ).not.toBeInTheDocument();
  });

  it("shows permanent delete only to an Administrator for an archived announcement", () => {
    useAnnouncements.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [archivedAnnouncement], total: 1 },
      refetch: vi.fn(),
    });

    const { unmount } = renderFor(USER_ROLES.ADMINISTRATOR);
    expect(
      screen.getByRole("button", { name: "Delete permanently" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit or pin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    unmount();

    renderFor(USER_ROLES.BARANGAY_HEALTH_WORKER);
    expect(
      screen.queryByRole("button", { name: "Delete permanently" }),
    ).toBeNull();
  });

  it.each([
    ["Administrator active", USER_ROLES.ADMINISTRATOR, announcement],
    [
      "Administrator scheduled",
      USER_ROLES.ADMINISTRATOR,
      scheduledAnnouncement,
    ],
    ["Administrator expired", USER_ROLES.ADMINISTRATOR, expiredAnnouncement],
    ["Nurse archived", USER_ROLES.NURSE, archivedAnnouncement],
    ["Midwife archived", USER_ROLES.MIDWIFE, archivedAnnouncement],
    ["Resident archived", USER_ROLES.RESIDENT, archivedAnnouncement],
  ])("does not show permanent delete for %s", (_label, role, record) => {
    useAnnouncements.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [record], total: 1 },
      refetch: vi.fn(),
    });

    renderFor(role);
    expect(
      screen.queryByRole("button", { name: "Delete permanently" }),
    ).toBeNull();
  });

  it("requires typing DELETE before permanently deleting an archived announcement", async () => {
    const user = userEvent.setup();
    useAnnouncements.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { items: [archivedAnnouncement], total: 1 },
      refetch: vi.fn(),
    });
    renderFor(USER_ROLES.ADMINISTRATOR);

    await user.click(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Permanently delete announcement?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This permanently removes the archived announcement and cannot be undone.",
      ),
    ).toBeInTheDocument();
    const confirmButton = screen.getByRole("button", {
      name: "Delete permanently",
    });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(mutateAsync).toHaveBeenCalledWith({
      id: archivedAnnouncement.id,
      version: archivedAnnouncement.version,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", {
          name: "Permanently delete announcement?",
        }),
      ).not.toBeInTheDocument(),
    );
  });
});
