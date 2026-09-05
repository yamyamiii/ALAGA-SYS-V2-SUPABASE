import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuth } from "@/features/auth/authContext";
import { USER_ROLES } from "@/features/auth/permissions";
import UserManagementPage from "@/features/user-management/UserManagementPage";
import { userManagementService } from "@/services/userManagementService";

vi.mock("@/features/auth/authContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/user-management/ResidentRegistrationReview", () => ({
  ResidentRegistrationReview: () => null,
}));

vi.mock("@/services/userManagementService", () => ({
  userManagementService: {
    listUsers: vi.fn(),
    getUser: vi.fn(),
    resendInvitation: vi.fn(),
    updateAccountStatus: vi.fn(),
    updateRole: vi.fn(),
    deleteAccountPermanently: vi.fn(),
    retireAccountPermanently: vi.fn(),
  },
}));

const administrator = {
  id: "10000000-0000-4000-8000-000000000001",
  role: USER_ROLES.ADMINISTRATOR,
};

const resident = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "resident@example.com",
  role: USER_ROLES.RESIDENT,
  first_name: "Legacy",
  last_name: "Resident",
  account_status: "active",
  registration_status: null,
  registration_version: null,
  permanent_delete_eligible: false,
  permanent_delete_kind: "resident",
  created_at: "2026-01-01T00:00:00Z",
  last_login_at: null,
};

function renderPage({ actor = administrator, target = resident } = {}) {
  useAuth.mockReturnValue({ profile: actor });
  userManagementService.listUsers.mockResolvedValue({
    items: [target],
    total: 1,
    page: 1,
    page_size: 10,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UserManagementPage />
    </QueryClientProvider>,
  );
}

describe("User Management permanent account deletion visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["legacy Administrator-created active Resident", "active", null],
    ["self-registered active Resident", "active", "approved"],
    ["inactive Resident", "inactive", null],
    ["suspended Resident without a registration", "suspended", null],
  ])(
    "shows the permanent-delete row action for a %s",
    async (_label, accountStatus, registrationStatus) => {
      const user = userEvent.setup();
      renderPage({
        target: {
          ...resident,
          account_status: accountStatus,
          registration_status: registrationStatus,
          registration_version: registrationStatus ? 4 : null,
          permanent_delete_eligible: true,
        },
      });

      const actionButtons = await screen.findAllByRole("button", {
        name: "Actions for Legacy Resident",
      });
      await user.click(actionButtons[0]);
      const deleteAction = await screen.findByRole("menuitem", {
        name: "Delete account permanently",
      });
      await user.click(deleteAction);

      expect(
        screen.getByRole("heading", {
          name: "Permanently delete Resident account?",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Type DELETE to confirm"),
      ).toBeInTheDocument();
    },
  );

  it("does not offer permanent deletion for a pending Resident registration", async () => {
    const user = userEvent.setup();
    renderPage({
      target: {
        ...resident,
        registration_status: "pending",
        registration_version: 4,
        account_status: "invited",
        permanent_delete_eligible: true,
      },
    });

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Legacy Resident",
    });
    await user.click(actionButtons[0]);
    expect(
      screen.queryByRole("menuitem", {
        name: "Delete account permanently",
      }),
    ).not.toBeInTheDocument();
  });

  it("offers safe cleanup for a dependency-free rejected registration in the managed-user list", async () => {
    const user = userEvent.setup();
    renderPage({
      target: {
        ...resident,
        registration_status: "rejected",
        registration_version: 2,
        account_status: "invited",
        permanent_delete_eligible: true,
      },
    });

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Legacy Resident",
    });
    await user.click(actionButtons[0]);
    expect(
      screen.getByRole("menuitem", {
        name: "Delete account permanently",
      }),
    ).toBeInTheDocument();
  });

  it("offers protected-history retirement instead of hard deletion", async () => {
    const user = userEvent.setup();
    userManagementService.retireAccountPermanently.mockResolvedValue({
      retired: true,
    });
    renderPage({
      target: {
        ...resident,
        permanent_delete_eligible: false,
        permanent_delete_blocker: "appointment_history",
      },
    });

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Legacy Resident",
    });
    await user.click(actionButtons[0]);
    expect(
      screen.getByRole("menuitem", {
        name: "Remove account access permanently",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", {
        name: "Delete account permanently",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("menuitem", {
        name: "Remove account access permanently",
      }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Remove account access permanently?",
      }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Type REMOVE to confirm"), "REMOVE");
    await user.click(
      screen.getByRole("button", {
        name: "Remove account access permanently",
      }),
    );

    await waitFor(() => {
      expect(
        userManagementService.retireAccountPermanently,
      ).toHaveBeenCalledWith(resident.id);
    });
    await waitFor(() => {
      expect(userManagementService.listUsers).toHaveBeenCalledTimes(2);
    });
  });

  it("changes the selected non-Admin account status and refreshes the managed list", async () => {
    const user = userEvent.setup();
    userManagementService.updateAccountStatus.mockResolvedValue({
      ...resident,
      account_status: "inactive",
    });
    renderPage();

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Legacy Resident",
    });
    await user.click(actionButtons[0]);
    await user.click(screen.getByRole("menuitem", { name: "Change status" }));

    expect(
      screen.queryByText(/remove the final active administrator/i),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("New status")).toHaveValue("inactive");
    await user.click(screen.getByRole("button", { name: "Confirm change" }));

    await waitFor(() => {
      expect(userManagementService.updateAccountStatus).toHaveBeenCalledWith(
        resident.id,
        "inactive",
      );
    });
    await waitFor(() => {
      expect(userManagementService.listUsers).toHaveBeenCalledTimes(2);
    });
  });

  it.each([
    USER_ROLES.BARANGAY_HEALTH_WORKER,
    USER_ROLES.NURSE,
    USER_ROLES.MIDWIFE,
    USER_ROLES.RESIDENT,
  ])("does not expose the action to a %s actor", async (role) => {
    const user = userEvent.setup();
    renderPage({
      actor: {
        id: "10000000-0000-4000-8000-000000000003",
        role,
      },
    });

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Legacy Resident",
    });
    await user.click(actionButtons[0]);
    expect(
      screen.queryByRole("menuitem", {
        name: "Delete account permanently",
      }),
    ).not.toBeInTheDocument();
  });

  it.each(
    [
      USER_ROLES.BARANGAY_HEALTH_WORKER,
      USER_ROLES.NURSE,
      USER_ROLES.MIDWIFE,
    ].flatMap((role) =>
      ["active", "inactive", "suspended"].map((status) => [role, status]),
    ),
  )(
    "offers permanent deletion for a %s target with %s status",
    async (role, status) => {
      const user = userEvent.setup();
      renderPage({
        target: {
          ...resident,
          role,
          account_status: status,
          permanent_delete_eligible: true,
          permanent_delete_kind: "account",
        },
      });

      const actionButtons = await screen.findAllByRole("button", {
        name: "Actions for Legacy Resident",
      });
      await user.click(actionButtons[0]);
      expect(
        screen.getByRole("menuitem", {
          name: "Delete account permanently",
        }),
      ).toBeInTheDocument();
    },
  );

  it("never offers permanent deletion for an Administrator target", async () => {
    const user = userEvent.setup();
    renderPage({ target: { ...resident, role: USER_ROLES.ADMINISTRATOR } });

    const actionButtons = await screen.findAllByRole("button", {
      name: "Actions for Legacy Resident",
    });
    await user.click(actionButtons[0]);
    expect(
      screen.queryByRole("menuitem", {
        name: "Delete account permanently",
      }),
    ).not.toBeInTheDocument();
  });
});
