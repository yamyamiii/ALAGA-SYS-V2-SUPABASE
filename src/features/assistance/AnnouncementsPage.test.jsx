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
  expires_at: null,
  is_pinned: false,
  creator_name: "Authorized Staff",
  archived_at: null,
  version: 4,
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
});
