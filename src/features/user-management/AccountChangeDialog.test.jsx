import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { USER_ROLES } from "@/features/auth/permissions";
import { AccountChangeDialog } from "@/features/user-management/AccountChangeDialog";
import { userManagementService } from "@/services/userManagementService";

vi.mock("@/services/userManagementService", () => ({
  userManagementService: {
    updateAccountStatus: vi.fn(),
    updateRole: vi.fn(),
  },
}));

const administratorId = "10000000-0000-4000-8000-000000000001";

function renderDialog(user, overrides = {}) {
  const props = {
    type: "status",
    user,
    currentUserId: administratorId,
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    ...overrides,
  };
  render(<AccountChangeDialog {...props} />);
  return props;
}

describe("managed account status changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userManagementService.updateAccountStatus.mockResolvedValue({});
  });

  it.each([
    USER_ROLES.RESIDENT,
    USER_ROLES.BARANGAY_HEALTH_WORKER,
    USER_ROLES.NURSE,
    USER_ROLES.MIDWIFE,
  ])(
    "allows an Administrator to deactivate a managed %s account",
    async (role) => {
      const target = {
        id: `10000000-0000-4000-8000-${role.padEnd(12, "0").slice(0, 12)}`,
        role,
        account_status: "active",
      };
      const props = renderDialog(target);

      expect(
        screen.queryByText(/remove the final active administrator/i),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /Existing records and retained history are not deleted/i,
        ),
      ).toBeInTheDocument();

      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Confirm change" }));

      await waitFor(() => {
        expect(userManagementService.updateAccountStatus).toHaveBeenCalledWith(
          target.id,
          "inactive",
        );
      });
      expect(props.onOpenChange).toHaveBeenCalledWith(false);
      expect(props.onSuccess).toHaveBeenCalledTimes(1);
    },
  );

  it("supports suspension when the existing transition graph allows it", async () => {
    const target = {
      id: "10000000-0000-4000-8000-000000000002",
      role: USER_ROLES.RESIDENT,
      account_status: "active",
    };
    renderDialog(target);

    await userEvent
      .setup()
      .selectOptions(screen.getByLabelText("New status"), "suspended");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Confirm change" }));

    await waitFor(() => {
      expect(userManagementService.updateAccountStatus).toHaveBeenCalledWith(
        target.id,
        "suspended",
      );
    });
  });

  it("keeps self-account guidance scoped to the current Administrator", () => {
    renderDialog({
      id: administratorId,
      role: USER_ROLES.ADMINISTRATOR,
      account_status: "active",
    });

    expect(
      screen.getByText(/cannot change your own role or account status here/i),
    ).toBeInTheDocument();
  });

  it("keeps final-active-Administrator guidance for Administrator targets", () => {
    renderDialog({
      id: "10000000-0000-4000-8000-000000000009",
      role: USER_ROLES.ADMINISTRATOR,
      account_status: "active",
    });

    expect(
      screen.getByText(/final active administrator cannot be demoted/i),
    ).toBeInTheDocument();
  });
});
