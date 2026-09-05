import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserDetailDialog } from "@/features/user-management/UserDetailDialog";
import { USER_ROLES } from "@/features/auth/permissions";
import { userManagementService } from "@/services/userManagementService";

vi.mock("@/services/userManagementService", () => ({
  userManagementService: {
    getUser: vi.fn(),
    updateProfile: vi.fn(),
    resendInvitation: vi.fn(),
  },
}));

const activeResident = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "resident@example.com",
  role: "resident",
  first_name: "Ana",
  last_name: "Reyes",
  account_status: "active",
  registration_status: "approved",
  registration_version: 2,
  permanent_delete_eligible: true,
  permanent_delete_kind: "resident",
};

function renderDialog(
  onRequestDelete = vi.fn(),
  target = activeResident,
  onRequestStatus = vi.fn(),
  onRequestRetire = vi.fn(),
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <UserDetailDialog
        userId={target.id}
        open
        onOpenChange={vi.fn()}
        onChanged={vi.fn()}
        onRequestRole={vi.fn()}
        onRequestStatus={onRequestStatus}
        onRequestDelete={onRequestDelete}
        onRequestRetire={onRequestRetire}
        currentUserId="10000000-0000-4000-8000-000000000001"
        currentUserRole={USER_ROLES.ADMINISTRATOR}
      />
    </QueryClientProvider>,
  );
  return onRequestDelete;
}

describe("Administrator permanent account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userManagementService.getUser.mockResolvedValue(activeResident);
  });

  it("offers permanent deletion for a server-verified dependency-free active Resident", async () => {
    const user = userEvent.setup();
    const onRequestDelete = renderDialog();
    const deleteAction = await screen.findByRole("button", {
      name: "Delete account permanently",
    });
    expect(screen.getByRole("button", { name: "Change status" })).toBeEnabled();
    await user.click(deleteAction);
    expect(onRequestDelete).toHaveBeenCalledWith(activeResident);
  });

  it("shows retention and deactivation guidance for a protected Resident", async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    const onRequestStatus = vi.fn();
    const onRequestRetire = vi.fn();
    const protectedResident = {
      ...activeResident,
      permanent_delete_eligible: false,
      permanent_delete_blocker: "appointment_history",
    };
    userManagementService.getUser.mockResolvedValue(protectedResident);
    renderDialog(
      onRequestDelete,
      activeResident,
      onRequestStatus,
      onRequestRetire,
    );

    expect(
      await screen.findByText("Permanent deletion unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This account has appointment history that must be retained. You can permanently remove login access without deleting that history.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change status" })).toBeEnabled();
    await user.click(
      screen.getByRole("button", {
        name: "Remove account access permanently",
      }),
    );
    expect(onRequestRetire).toHaveBeenCalledWith(protectedResident);
    expect(onRequestStatus).not.toHaveBeenCalled();
    expect(onRequestDelete).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
  });

  it("offers permanent access removal for an inactive protected account", async () => {
    userManagementService.getUser.mockResolvedValue({
      ...activeResident,
      account_status: "inactive",
      permanent_delete_eligible: false,
      permanent_delete_blocker: "clinical_history",
    });
    renderDialog();

    expect(
      await screen.findByRole("button", {
        name: "Remove account access permanently",
      }),
    ).toBeEnabled();
  });

  it.each([
    ["legacy active Resident", "active", null],
    ["self-registered active Resident", "active", "approved"],
    ["inactive Resident", "inactive", null],
    ["suspended Resident", "suspended", null],
  ])(
    "offers permanent deletion for a %s",
    async (_label, status, registrationStatus) => {
      userManagementService.getUser.mockResolvedValue({
        ...activeResident,
        account_status: status,
        registration_status: registrationStatus,
        registration_version: registrationStatus ? 3 : null,
        permanent_delete_eligible: true,
      });
      renderDialog();

      expect(
        await screen.findByRole("button", {
          name: "Delete account permanently",
        }),
      ).toBeInTheDocument();
    },
  );

  it("offers permanent deletion for a server-approved dependency-free archived Resident", async () => {
    userManagementService.getUser.mockResolvedValue({
      ...activeResident,
      account_status: "inactive",
      resident_status: "archived",
      permanent_delete_eligible: true,
      permanent_delete_blocker: null,
    });
    renderDialog();

    expect(
      await screen.findByRole("button", {
        name: "Delete account permanently",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    USER_ROLES.RESIDENT,
    USER_ROLES.BARANGAY_HEALTH_WORKER,
    USER_ROLES.NURSE,
    USER_ROLES.MIDWIFE,
  ])("offers permanent deletion for a %s target", async (role) => {
    const target = {
      ...activeResident,
      role,
      permanent_delete_kind:
        role === USER_ROLES.RESIDENT ? "resident" : "account",
      permanent_delete_eligible: true,
    };
    userManagementService.getUser.mockResolvedValue(target);
    const onRequestDelete = vi.fn();
    renderDialog(onRequestDelete, target);

    const deleteAction = await screen.findByRole("button", {
      name: "Delete account permanently",
    });
    await userEvent.setup().click(deleteAction);
    expect(onRequestDelete).toHaveBeenCalledWith(target);
  });

  it("does not offer permanent deletion for an Administrator target", async () => {
    const target = { ...activeResident, role: USER_ROLES.ADMINISTRATOR };
    userManagementService.getUser.mockResolvedValue(target);
    renderDialog(vi.fn(), target);

    expect(await screen.findByText(target.email)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer permanent deletion for a pending Resident registration", async () => {
    const target = {
      ...activeResident,
      registration_status: "pending",
      permanent_delete_eligible: true,
    };
    userManagementService.getUser.mockResolvedValue(target);
    renderDialog(vi.fn(), target);

    expect(await screen.findByText(target.email)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
  });

  it("offers cleanup for a dependency-free rejected registration from normal user details", async () => {
    const target = {
      ...activeResident,
      account_status: "invited",
      registration_status: "rejected",
      permanent_delete_eligible: true,
    };
    userManagementService.getUser.mockResolvedValue(target);
    renderDialog(vi.fn(), target);

    expect(
      await screen.findByRole("button", {
        name: "Delete account permanently",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    USER_ROLES.BARANGAY_HEALTH_WORKER,
    USER_ROLES.NURSE,
    USER_ROLES.MIDWIFE,
    USER_ROLES.RESIDENT,
  ])("does not expose permanent deletion to %s", async (currentUserRole) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <UserDetailDialog
          userId={activeResident.id}
          open
          onOpenChange={vi.fn()}
          onChanged={vi.fn()}
          onRequestRole={vi.fn()}
          onRequestStatus={vi.fn()}
          onRequestDelete={vi.fn()}
          currentUserId="10000000-0000-4000-8000-000000000003"
          currentUserRole={currentUserRole}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(activeResident.email)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete account permanently" }),
    ).not.toBeInTheDocument();
  });
});
