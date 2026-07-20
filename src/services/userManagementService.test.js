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
});
