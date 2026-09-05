import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermanentDeleteAccountDialog } from "@/features/user-management/PermanentDeleteAccountDialog";
import { userManagementService } from "@/services/userManagementService";

vi.mock("@/services/userManagementService", () => ({
  userManagementService: {
    deleteAccountPermanently: vi.fn(),
  },
}));

describe("permanent account deletion dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userManagementService.deleteAccountPermanently.mockResolvedValue({
      deleted: true,
    });
  });

  it("uses the linked-Resident warning and supports accounts without registration versions", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <PermanentDeleteAccountDialog
        account={{
          id: "10000000-0000-4000-8000-000000000001",
          registration_version: null,
          permanent_delete_kind: "resident",
        }}
        open
        onOpenChange={onOpenChange}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Permanently delete Resident account?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This permanently removes the Resident login and Resident record only if the server confirms no protected history exists. This action cannot be undone.",
      ),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );

    await waitFor(() =>
      expect(
        userManagementService.deleteAccountPermanently,
      ).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001", null),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses the generic warning for staff accounts and still requires DELETE", async () => {
    const user = userEvent.setup();
    render(
      <PermanentDeleteAccountDialog
        account={{
          id: "10000000-0000-4000-8000-000000000002",
          registration_version: null,
          permanent_delete_kind: "account",
        }}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Permanently delete account?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This permanently removes the user's login account if the server confirms that no protected system history depends on it. This action cannot be undone.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete account permanently" }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(
      screen.getByRole("button", { name: "Delete account permanently" }),
    );

    await waitFor(() =>
      expect(
        userManagementService.deleteAccountPermanently,
      ).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000002", null),
    );
  });
});
