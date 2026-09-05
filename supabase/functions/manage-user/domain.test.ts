import { describe, expect, it } from "vitest";

import {
  assertNotSelf,
  authorizeAdministrator,
  isAllowedStatusTransition,
  mapAuthAdminError,
  mapDatabaseError,
  sanitizeUser,
  validateManageUserRequest,
} from "./domain.ts";

const targetId = "10000000-0000-4000-8000-000000000001";

const validProfile = {
  first_name: "  Ana  ",
  middle_name: "",
  last_name: "Reyes",
  suffix: "",
  phone_number: "+63 900 000 0000",
};

describe("manage-user trust boundary", () => {
  it("authorizes only active administrator profiles", () => {
    expect(
      authorizeAdministrator({ role: "admin", account_status: "active" }),
    ).toMatchObject({ role: "admin" });
    expect(() =>
      authorizeAdministrator({ role: "nurse", account_status: "active" }),
    ).toThrowError(expect.objectContaining({ code: "administrator_required" }));
    expect(() =>
      authorizeAdministrator({ role: "admin", account_status: "inactive" }),
    ).toThrowError(expect.objectContaining({ code: "administrator_inactive" }));
  });

  it("normalizes and validates an invitation request", () => {
    const result = validateManageUserRequest({
      action: "invite_user",
      payload: {
        email: "  TEST.User@Example.com ",
        role: "barangay_health_worker",
        ...validProfile,
      },
    });
    expect(result.payload).toMatchObject({
      email: "test.user@example.com",
      role: "barangay_health_worker",
      first_name: "Ana",
      middle_name: null,
    });
  });

  it("requires a strong temporary password for direct creation", () => {
    expect(() =>
      validateManageUserRequest({
        action: "create_user",
        payload: {
          email: "test@example.com",
          role: "nurse",
          ...validProfile,
          temporary_password: "short",
        },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "weak_temporary_password" }),
    );
  });

  it("rejects unknown roles and arbitrary fields", () => {
    expect(() =>
      validateManageUserRequest({
        action: "invite_user",
        payload: {
          email: "test@example.com",
          role: "health_worker",
          ...validProfile,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_role" }));
    expect(() =>
      validateManageUserRequest({
        action: "update_profile",
        payload: {
          user_id: targetId,
          ...validProfile,
          account_status: "active",
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
  });

  it("maps duplicate Auth users to a stable conflict", () => {
    expect(
      mapAuthAdminError({
        code: "user_already_exists",
        message: "User already exists",
      }),
    ).toMatchObject({ code: "duplicate_email", status: 409 });
  });

  it("prevents self role and status changes", () => {
    expect(() => assertNotSelf(targetId, targetId, "role")).toThrowError(
      expect.objectContaining({ code: "self_role_change_forbidden" }),
    );
    expect(() =>
      assertNotSelf(targetId, targetId, "account status"),
    ).toThrowError(
      expect.objectContaining({ code: "self_status_change_forbidden" }),
    );
  });

  it("enforces the explicit account-status transition graph", () => {
    expect(isAllowedStatusTransition("invited", "active")).toBe(true);
    expect(isAllowedStatusTransition("active", "suspended")).toBe(true);
    expect(isAllowedStatusTransition("suspended", "inactive")).toBe(true);
    expect(isAllowedStatusTransition("inactive", "suspended")).toBe(false);
    expect(isAllowedStatusTransition("active", "invited")).toBe(false);
  });

  it("returns only approved Auth and profile fields", () => {
    expect(
      sanitizeUser({
        id: targetId,
        email: "test@example.com",
        role: "resident",
        account_status: "active",
        first_name: "Ana",
        encrypted_password: "never-return",
        refresh_token: "never-return",
        identities: [{ provider: "email" }],
        app_metadata: { provider: "email" },
      }),
    ).toEqual({
      id: targetId,
      email: "test@example.com",
      role: "resident",
      first_name: "Ana",
      middle_name: null,
      last_name: null,
      suffix: null,
      phone_number: null,
      account_status: "active",
      last_login_at: null,
      created_at: null,
      invitation_sent_at: null,
      status_changed_at: null,
      registration_status: null,
      registration_version: null,
      permanent_delete_eligible: false,
      permanent_delete_kind: null,
      permanent_delete_blocker: null,
    });
  });

  it("forces resident invitations to the resident role", () => {
    const result = validateManageUserRequest({
      action: "invite_resident_account",
      payload: {
        resident_id: targetId,
        email: "resident@example.com",
        ...validProfile,
      },
    });
    expect(result.payload).toMatchObject({
      resident_id: targetId,
      role: "resident",
      email: "resident@example.com",
    });
    expect(() =>
      validateManageUserRequest({
        action: "invite_resident_account",
        payload: {
          resident_id: targetId,
          email: "resident@example.com",
          role: "admin",
          ...validProfile,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
  });

  it("validates narrowly scoped resident link actions", () => {
    expect(
      validateManageUserRequest({
        action: "link_resident_account",
        payload: { resident_id: targetId, profile_id: targetId },
      }),
    ).toMatchObject({
      payload: { resident_id: targetId, profile_id: targetId },
    });
    expect(() =>
      validateManageUserRequest({
        action: "unlink_resident_account",
        payload: { resident_id: targetId, delete_auth_user: true },
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
  });

  it("validates Administrator-only Resident registration review actions", () => {
    expect(
      validateManageUserRequest({
        action: "list_resident_registrations",
        payload: { page: 1, page_size: 20, status: "pending" },
      }),
    ).toMatchObject({
      payload: { page: 1, page_size: 20, status: "pending" },
    });
    expect(
      validateManageUserRequest({
        action: "approve_resident_registration",
        payload: {
          registration_id: targetId,
          resident_id: null,
          version: 1,
        },
      }),
    ).toMatchObject({
      payload: {
        registration_id: targetId,
        resident_id: null,
        version: 1,
      },
    });
    expect(() =>
      validateManageUserRequest({
        action: "approve_resident_registration",
        payload: {
          registration_id: targetId,
          role: "admin",
          version: 1,
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
    expect(() =>
      validateManageUserRequest({
        action: "reject_resident_registration",
        payload: { registration_id: targetId, version: 0 },
      }),
    ).toThrowError(expect.objectContaining({ code: "validation_error" }));
    expect(
      validateManageUserRequest({
        action: "delete_resident_registration_account",
        payload: { user_id: targetId, version: 2 },
      }),
    ).toMatchObject({
      payload: { user_id: targetId, version: 2 },
    });
    expect(
      validateManageUserRequest({
        action: "delete_resident_registration_account",
        payload: { user_id: targetId, version: null },
      }),
    ).toMatchObject({
      payload: { user_id: targetId, version: null },
    });
    expect(
      validateManageUserRequest({
        action: "delete_user_account",
        payload: { user_id: targetId, version: null },
      }),
    ).toMatchObject({
      action: "delete_user_account",
      payload: { user_id: targetId, version: null },
    });
    expect(() =>
      validateManageUserRequest({
        action: "delete_resident_registration_account",
        payload: { user_id: targetId, version: 2, force: true },
      }),
    ).toThrowError(expect.objectContaining({ code: "unknown_field" }));
  });

  it("maps permanent deletion dependency failures to a safe deactivation message", () => {
    expect(
      mapDatabaseError({
        code: "23503",
        message:
          "this account has protected records and cannot be permanently deleted",
      }),
    ).toMatchObject({
      code: "account_delete_has_dependencies",
      status: 409,
      message:
        "This account has existing records and cannot be permanently deleted. Remove account access permanently instead.",
    });
    expect(
      mapDatabaseError({
        code: "23503",
        message:
          "this Resident has existing records and cannot be permanently deleted",
      }),
    ).toMatchObject({
      code: "resident_delete_has_dependencies",
      status: 409,
      message:
        "This Resident has existing records and cannot be permanently deleted. Remove account access permanently instead.",
    });
  });
});
