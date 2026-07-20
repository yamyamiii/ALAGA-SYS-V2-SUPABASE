export const USER_ROLES = [
  "admin",
  "barangay_health_worker",
  "nurse",
  "midwife",
  "resident",
] as const;

export const ACCOUNT_STATUSES = [
  "invited",
  "active",
  "inactive",
  "suspended",
] as const;

export const MANAGE_USER_ACTIONS = [
  "invite_user",
  "create_user",
  "resend_invitation",
  "update_role",
  "update_account_status",
  "update_profile",
  "list_users",
  "get_user",
  "list_resident_link_candidates",
  "get_resident_account",
  "link_resident_account",
  "unlink_resident_account",
  "invite_resident_account",
] as const;

type UserRole = (typeof USER_ROLES)[number];
type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
type ManageUserAction = (typeof MANAGE_USER_ACTIONS)[number];
type UnknownRecord = Record<string, unknown>;

export class ManageUserError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ManageUserError";
    this.code = code;
    this.status = status;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+0-9()\-.\s]{7,30}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  location: string,
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ManageUserError(
      "unknown_field",
      `${location} contains unsupported fields.`,
    );
  }
}

function requiredString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ManageUserError("validation_error", `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ManageUserError("validation_error", `${field} is too long.`);
  }
  return normalized;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ManageUserError("validation_error", `${field} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximum) {
    throw new ManageUserError("validation_error", `${field} is too long.`);
  }
  return normalized;
}

function normalizedEmail(value: unknown): string {
  const email = requiredString(value, "Email", 254).toLowerCase();
  if (!emailPattern.test(email)) {
    throw new ManageUserError(
      "validation_error",
      "Enter a valid email address.",
    );
  }
  return email;
}

function validRole(value: unknown): UserRole {
  if (!USER_ROLES.includes(value as UserRole)) {
    throw new ManageUserError(
      "invalid_role",
      "Select a supported account role.",
    );
  }
  return value as UserRole;
}

function validStatus(value: unknown): AccountStatus {
  if (!ACCOUNT_STATUSES.includes(value as AccountStatus)) {
    throw new ManageUserError(
      "invalid_status",
      "Select a supported account status.",
    );
  }
  return value as AccountStatus;
}

function validUuid(value: unknown, field = "User"): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new ManageUserError(
      "validation_error",
      `${field} identifier is invalid.`,
    );
  }
  return value;
}

function profileFields(payload: UnknownRecord) {
  const phoneNumber = optionalString(payload.phone_number, "Phone number", 30);
  if (phoneNumber && !phonePattern.test(phoneNumber)) {
    throw new ManageUserError(
      "validation_error",
      "Phone number contains unsupported characters.",
    );
  }

  return {
    first_name: requiredString(payload.first_name, "First name", 100),
    middle_name: optionalString(payload.middle_name, "Middle name", 100),
    last_name: requiredString(payload.last_name, "Last name", 100),
    suffix: optionalString(payload.suffix, "Suffix", 30),
    phone_number: phoneNumber,
  };
}

function validateProvisioning(
  payload: UnknownRecord,
  createWithPassword: boolean,
) {
  const allowed = [
    "email",
    "role",
    "first_name",
    "middle_name",
    "last_name",
    "suffix",
    "phone_number",
  ];
  if (createWithPassword) allowed.push("temporary_password");
  rejectUnknownKeys(payload, allowed, "User data");

  const result: UnknownRecord = {
    email: normalizedEmail(payload.email),
    role: validRole(payload.role),
    ...profileFields(payload),
  };

  if (createWithPassword) {
    const password = requiredString(
      payload.temporary_password,
      "Temporary password",
      128,
    );
    if (password.length < 12) {
      throw new ManageUserError(
        "weak_temporary_password",
        "Temporary passwords must contain at least 12 characters.",
      );
    }
    result.temporary_password = password;
  }

  return result;
}

export function authorizeAdministrator(profile: unknown) {
  if (!isRecord(profile)) {
    throw new ManageUserError(
      "profile_missing",
      "The caller does not have an ALAGA-SYS profile.",
      403,
    );
  }
  if (profile.account_status !== "active") {
    throw new ManageUserError(
      "administrator_inactive",
      "An active administrator account is required.",
      403,
    );
  }
  if (profile.role !== "admin") {
    throw new ManageUserError(
      "administrator_required",
      "Administrator permission is required.",
      403,
    );
  }
  return profile;
}

export function assertNotSelf(
  actorId: string,
  targetId: string,
  field: string,
) {
  if (actorId === targetId) {
    const roleChange = field === "role";
    throw new ManageUserError(
      roleChange
        ? "self_role_change_forbidden"
        : "self_status_change_forbidden",
      `Administrators cannot change their own ${field}.`,
      409,
    );
  }
}

export function isAllowedStatusTransition(
  current: AccountStatus,
  next: AccountStatus,
) {
  const transitions: Record<AccountStatus, AccountStatus[]> = {
    invited: ["active", "inactive"],
    active: ["inactive", "suspended"],
    inactive: ["active"],
    suspended: ["active", "inactive"],
  };
  return transitions[current].includes(next);
}

export function validateManageUserRequest(input: unknown): {
  action: ManageUserAction;
  payload: UnknownRecord;
} {
  if (!isRecord(input)) {
    throw new ManageUserError(
      "invalid_request",
      "Request body must be a JSON object.",
    );
  }
  rejectUnknownKeys(input, ["action", "payload"], "Request");

  if (!MANAGE_USER_ACTIONS.includes(input.action as ManageUserAction)) {
    throw new ManageUserError(
      "invalid_action",
      "The requested user-management action is not supported.",
    );
  }
  if (!isRecord(input.payload)) {
    throw new ManageUserError(
      "invalid_request",
      "Request payload must be a JSON object.",
    );
  }

  const action = input.action as ManageUserAction;
  const payload = input.payload;

  switch (action) {
    case "invite_user":
      return { action, payload: validateProvisioning(payload, false) };
    case "invite_resident_account": {
      rejectUnknownKeys(
        payload,
        [
          "resident_id",
          "email",
          "first_name",
          "middle_name",
          "last_name",
          "suffix",
          "phone_number",
        ],
        "Action payload",
      );
      return {
        action,
        payload: {
          resident_id: validUuid(payload.resident_id, "Resident"),
          email: normalizedEmail(payload.email),
          role: "resident",
          ...profileFields(payload),
        },
      };
    }
    case "create_user":
      return { action, payload: validateProvisioning(payload, true) };
    case "resend_invitation":
    case "get_user":
      rejectUnknownKeys(payload, ["user_id"], "Action payload");
      return {
        action,
        payload: { user_id: validUuid(payload.user_id) },
      };
    case "get_resident_account":
    case "unlink_resident_account":
      rejectUnknownKeys(payload, ["resident_id"], "Action payload");
      return {
        action,
        payload: { resident_id: validUuid(payload.resident_id, "Resident") },
      };
    case "link_resident_account":
      rejectUnknownKeys(
        payload,
        ["resident_id", "profile_id"],
        "Action payload",
      );
      return {
        action,
        payload: {
          resident_id: validUuid(payload.resident_id, "Resident"),
          profile_id: validUuid(payload.profile_id, "Profile"),
        },
      };
    case "update_role":
      rejectUnknownKeys(payload, ["user_id", "role"], "Action payload");
      return {
        action,
        payload: {
          user_id: validUuid(payload.user_id),
          role: validRole(payload.role),
        },
      };
    case "update_account_status":
      rejectUnknownKeys(
        payload,
        ["user_id", "account_status"],
        "Action payload",
      );
      return {
        action,
        payload: {
          user_id: validUuid(payload.user_id),
          account_status: validStatus(payload.account_status),
        },
      };
    case "update_profile":
      rejectUnknownKeys(
        payload,
        [
          "user_id",
          "first_name",
          "middle_name",
          "last_name",
          "suffix",
          "phone_number",
        ],
        "Action payload",
      );
      return {
        action,
        payload: {
          user_id: validUuid(payload.user_id),
          ...profileFields(payload),
        },
      };
    case "list_users": {
      rejectUnknownKeys(
        payload,
        ["page", "page_size", "search", "role", "account_status"],
        "Action payload",
      );
      const page = payload.page ?? 1;
      const pageSize = payload.page_size ?? 20;
      if (!Number.isInteger(page) || Number(page) < 1) {
        throw new ManageUserError(
          "validation_error",
          "Page must be a positive integer.",
        );
      }
      if (
        !Number.isInteger(pageSize) ||
        Number(pageSize) < 1 ||
        Number(pageSize) > 100
      ) {
        throw new ManageUserError(
          "validation_error",
          "Page size must be between 1 and 100.",
        );
      }
      return {
        action,
        payload: {
          page: Number(page),
          page_size: Number(pageSize),
          search: optionalString(payload.search, "Search", 100),
          role:
            payload.role === undefined ||
            payload.role === null ||
            payload.role === ""
              ? null
              : validRole(payload.role),
          account_status:
            payload.account_status === undefined ||
            payload.account_status === null ||
            payload.account_status === ""
              ? null
              : validStatus(payload.account_status),
        },
      };
    }
    case "list_resident_link_candidates": {
      rejectUnknownKeys(
        payload,
        ["page", "page_size", "search"],
        "Action payload",
      );
      const page = payload.page ?? 1;
      const pageSize = payload.page_size ?? 20;
      if (!Number.isInteger(page) || Number(page) < 1) {
        throw new ManageUserError(
          "validation_error",
          "Page must be a positive integer.",
        );
      }
      if (
        !Number.isInteger(pageSize) ||
        Number(pageSize) < 1 ||
        Number(pageSize) > 50
      ) {
        throw new ManageUserError(
          "validation_error",
          "Page size must be between 1 and 50.",
        );
      }
      return {
        action,
        payload: {
          page: Number(page),
          page_size: Number(pageSize),
          search: optionalString(payload.search, "Search", 100),
        },
      };
    }
  }
}

export function mapAuthAdminError(error: unknown): ManageUserError {
  const message =
    isRecord(error) && typeof error.message === "string" ? error.message : "";
  const code =
    isRecord(error) && typeof error.code === "string" ? error.code : "";

  if (
    ["email_exists", "user_already_exists"].includes(code) ||
    /already (?:been )?registered|already exists|duplicate/i.test(message)
  ) {
    return new ManageUserError(
      "duplicate_email",
      "An account already exists for that email address.",
      409,
    );
  }
  if (/rate limit/i.test(message) || code === "over_email_send_rate_limit") {
    return new ManageUserError(
      "email_rate_limited",
      "Invitation email limits were reached. Try again later.",
      429,
    );
  }
  return new ManageUserError(
    "auth_admin_failed",
    "Supabase Auth could not complete the requested action.",
    502,
  );
}

export function mapDatabaseError(error: unknown): ManageUserError {
  const message =
    isRecord(error) && typeof error.message === "string" ? error.message : "";
  if (/final active administrator/i.test(message)) {
    return new ManageUserError(
      "last_active_administrator",
      "The final active administrator cannot be changed.",
      409,
    );
  }
  if (/own role/i.test(message)) {
    return new ManageUserError(
      "self_role_change_forbidden",
      "Administrators cannot change their own role.",
      409,
    );
  }
  if (/own account status/i.test(message)) {
    return new ManageUserError(
      "self_status_change_forbidden",
      "Administrators cannot change their own account status.",
      409,
    );
  }
  if (/transition is not allowed/i.test(message)) {
    return new ManageUserError(
      "invalid_status_transition",
      "That account status transition is not allowed.",
      409,
    );
  }
  if (/profile not found|Auth user profile was not created/i.test(message)) {
    return new ManageUserError(
      "profile_not_found",
      "The requested user profile was not found.",
      404,
    );
  }
  if (/resident not found/i.test(message)) {
    return new ManageUserError(
      "resident_not_found",
      "The requested resident was not found.",
      404,
    );
  }
  if (/already linked/i.test(message)) {
    return new ManageUserError(
      "profile_already_linked",
      "That portal account is already linked to another resident.",
      409,
    );
  }
  if (/archived residents cannot/i.test(message)) {
    return new ManageUserError(
      "archived_resident_link_forbidden",
      "Archived residents cannot be linked to portal accounts.",
      409,
    );
  }
  if (/active or invited resident-role profile/i.test(message)) {
    return new ManageUserError(
      "invalid_resident_profile",
      "Select an active or invited resident portal account.",
      409,
    );
  }
  return new ManageUserError(
    "database_action_failed",
    "The account change could not be saved.",
    500,
  );
}

export function sanitizeUser(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    id: value.id ?? null,
    email: value.email ?? null,
    role: value.role ?? null,
    first_name: value.first_name ?? null,
    middle_name: value.middle_name ?? null,
    last_name: value.last_name ?? null,
    suffix: value.suffix ?? null,
    phone_number: value.phone_number ?? null,
    account_status: value.account_status ?? null,
    last_login_at: value.last_login_at ?? null,
    created_at: value.created_at ?? null,
    invitation_sent_at: value.invitation_sent_at ?? null,
    status_changed_at: value.status_changed_at ?? null,
  };
}
