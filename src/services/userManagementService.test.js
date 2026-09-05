import { describe, expect, it, vi } from "vitest";

import {
  createUserManagementService,
  UserManagementServiceError,
} from "@/services/userManagementService";

describe("user management service", () => {
  it("invokes the trusted function without using an admin browser client", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { data: { items: [], total: 0, page: 1, page_size: 10 } },
      error: null,
    });
    const service = createUserManagementService(() => ({
      functions: { invoke },
    }));

    await service.listUsers({ page: 1, page_size: 10 });

    expect(invoke).toHaveBeenCalledWith("manage-user", {
      body: {
        action: "list_users",
        payload: { page: 1, page_size: 10 },
      },
    });
  });

  it("preserves predictable safe function errors", async () => {
    const service = createUserManagementService(() => ({
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: {
            context: {
              json: vi.fn().mockResolvedValue({
                error: {
                  code: "last_active_administrator",
                  message: "The final active administrator cannot be changed.",
                },
              }),
            },
          },
        }),
      },
    }));

    await expect(service.updateRole("user-id", "nurse")).rejects.toEqual(
      expect.objectContaining({
        name: "UserManagementServiceError",
        code: "last_active_administrator",
      }),
    );
  });

  it("rejects malformed function responses", async () => {
    const service = createUserManagementService(() => ({
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
      },
    }));

    await expect(service.getUser("user-id")).rejects.toBeInstanceOf(
      UserManagementServiceError,
    );
  });

  it("routes resident linking only through the trusted function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { data: { linked: true } },
      error: null,
    });
    const service = createUserManagementService(() => ({
      functions: { invoke },
    }));
    await service.linkResidentAccount("resident-id", "profile-id");
    expect(invoke).toHaveBeenCalledWith("manage-user", {
      body: {
        action: "link_resident_account",
        payload: {
          resident_id: "resident-id",
          profile_id: "profile-id",
        },
      },
    });
  });

  it("sends the selected managed-user ID through the trusted status workflow", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { data: { user: { id: "resident-profile-id" } } },
      error: null,
    });
    const service = createUserManagementService(() => ({
      functions: { invoke },
    }));

    await service.updateAccountStatus("resident-profile-id", "inactive");

    expect(invoke).toHaveBeenCalledWith("manage-user", {
      body: {
        action: "update_account_status",
        payload: {
          user_id: "resident-profile-id",
          account_status: "inactive",
        },
      },
    });
  });

  it("routes protected-history retirement through the trusted function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: {
          retired: true,
          history_retained: true,
          email_reusable: true,
        },
      },
      error: null,
    });
    const service = createUserManagementService(() => ({
      functions: { invoke },
    }));

    await service.retireAccountPermanently("protected-profile-id");

    expect(invoke).toHaveBeenCalledWith("manage-user", {
      body: {
        action: "retire_user_account",
        payload: { user_id: "protected-profile-id" },
      },
    });
  });

  it("routes Resident registration approval through the trusted function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        data: {
          approved: true,
          resident: { id: "resident-id", resident_number: "RES-2026-000001" },
        },
      },
      error: null,
    });
    const service = createUserManagementService(() => ({
      functions: { invoke },
    }));

    await service.approveResidentRegistration("registration-id", 3, null);
    expect(invoke).toHaveBeenCalledWith("manage-user", {
      body: {
        action: "approve_resident_registration",
        payload: {
          registration_id: "registration-id",
          resident_id: null,
          version: 3,
        },
      },
    });
  });

  it("routes generalized permanent deletion only through the trusted manage-user function", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { data: { deleted: true, user_id: "user-id" } },
      error: null,
    });
    const service = createUserManagementService(() => ({
      functions: { invoke },
    }));

    await service.deleteAccountPermanently("user-id", 4);

    expect(invoke).toHaveBeenCalledWith("manage-user", {
      body: {
        action: "delete_user_account",
        payload: { user_id: "user-id", version: 4 },
      },
    });

    await service.deleteAccountPermanently("active-user-id", null);
    expect(invoke).toHaveBeenLastCalledWith("manage-user", {
      body: {
        action: "delete_user_account",
        payload: { user_id: "active-user-id", version: null },
      },
    });

    await service.deleteResidentRegistrationAccount("legacy-user-id", null);
    expect(invoke).toHaveBeenLastCalledWith("manage-user", {
      body: {
        action: "delete_user_account",
        payload: { user_id: "legacy-user-id", version: null },
      },
    });
  });
});
