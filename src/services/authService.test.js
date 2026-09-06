import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_ERROR_CODES, createAuthService } from "@/services/authService";

const activeProfile = {
  id: "user-1",
  role: "nurse",
  first_name: "Maria",
  last_name: "Santos",
  avatar_path: "avatars/user-1.png",
  account_status: "active",
};

const validSession = {
  access_token: "access-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "user-1" },
};

function createClient({
  profile = activeProfile,
  profileError = null,
  session = validSession,
  getSessionError = null,
  getUserError = null,
  signInError = null,
  refreshSession = validSession,
  refreshError = null,
  registration = null,
  registrationError = null,
} = {}) {
  const query = (data, error) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    return { select };
  };
  const client = {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { session },
        error: signInError,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session },
        error: getSessionError,
      }),
      refreshSession: vi.fn().mockResolvedValue({
        data: { session: refreshSession },
        error: refreshError,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: getUserError
            ? null
            : { id: "user-1", email: "maria@example.com" },
        },
        error: getUserError,
      }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      setSession: vi.fn().mockResolvedValue({
        data: { session: validSession, user: validSession.user },
        error: null,
      }),
      verifyOtp: vi.fn().mockResolvedValue({
        data: { session: validSession, user: validSession.user },
        error: null,
      }),
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { session: validSession, user: validSession.user },
        error: null,
      }),
      updateUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn((table) =>
      table === "resident_registration_requests"
        ? query(registration, registrationError)
        : query(profile, profileError),
    ),
  };
  return client;
}

describe("auth service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("logs in and exposes only the approved profile fields", async () => {
    const client = createClient();
    const service = createAuthService(() => client);

    await expect(
      service.signIn({
        email: "maria@example.com",
        password: "valid-password",
        remember: true,
      }),
    ).resolves.toEqual({
      id: "user-1",
      role: "nurse",
      first_name: "Maria",
      last_name: "Santos",
      avatar: "avatars/user-1.png",
    });
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "maria@example.com",
      password: "valid-password",
    });
  });

  it("keeps existing active Administrator-created Resident accounts working", async () => {
    const client = createClient({
      profile: { ...activeProfile, role: "resident" },
      registration: null,
    });
    const service = createAuthService(() => client);

    await expect(
      service.signIn({
        email: "existing-resident@example.com",
        password: "Secure123",
      }),
    ).resolves.toMatchObject({ id: "user-1", role: "resident" });
    expect(client.from).not.toHaveBeenCalledWith(
      "resident_registration_requests",
    );
  });

  it("returns a safe error for invalid login credentials", async () => {
    const client = createClient({
      signInError: { status: 400, message: "Invalid login credentials" },
    });
    const service = createAuthService(() => client);

    await expect(
      service.signIn({
        email: "maria@example.com",
        password: "incorrect-password",
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: "The email or password you entered is incorrect.",
    });
  });

  it("distinguishes an unconfirmed email and allows a safe resend", async () => {
    const client = createClient({
      signInError: {
        status: 400,
        code: "email_not_confirmed",
        message: "Email not confirmed",
      },
    });
    const service = createAuthService(() => client);

    await expect(
      service.signIn({
        email: "maria@example.com",
        password: "Secure123",
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED,
      message: "Please confirm your email address before signing in.",
    });

    await service.resendConfirmation(" maria@example.com ");
    expect(client.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "maria@example.com",
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
  });

  it("requests a password reset with the current application origin", async () => {
    const client = createClient();
    const service = createAuthService(() => client);

    await service.requestPasswordReset(" unknown@example.com ");

    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "unknown@example.com",
      { redirectTo: `${window.location.origin}/reset-password` },
    );
  });

  it("maps over_email_send_rate_limit without revealing account existence", async () => {
    const client = createClient();
    client.auth.resetPasswordForEmail.mockResolvedValue({
      error: {
        code: "over_email_send_rate_limit",
        status: 429,
        message: "Email rate limit exceeded",
      },
    });
    const service = createAuthService(() => client);

    await expect(
      service.requestPasswordReset("unknown@example.com"),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.EMAIL_SEND_RATE_LIMITED,
      message:
        "Email sending is temporarily limited. Please wait a few minutes and try again. Your registration information was not lost if the account was already created.",
    });
  });

  it("maps over_request_rate_limit separately for confirmation resend", async () => {
    const client = createClient();
    client.auth.resend.mockResolvedValue({
      error: {
        code: "over_request_rate_limit",
        status: 429,
        message: "Too many requests",
      },
    });
    const service = createAuthService(() => client);

    await expect(
      service.resendConfirmation("resident@example.com"),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.REQUEST_RATE_LIMITED,
      message:
        "Too many requests were made in a short period. Please wait a few minutes and try again.",
    });
  });

  it("coalesces duplicate password-reset and confirmation-resend requests", async () => {
    let resolveReset;
    let resolveResend;
    const client = createClient();
    client.auth.resetPasswordForEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        }),
    );
    client.auth.resend.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResend = resolve;
        }),
    );
    const service = createAuthService(() => client);

    const resetOne = service.requestPasswordReset("resident@example.com");
    const resetTwo = service.requestPasswordReset("resident@example.com");
    const resendOne = service.resendConfirmation("resident@example.com");
    const resendTwo = service.resendConfirmation("resident@example.com");
    expect(resetTwo).toBe(resetOne);
    expect(resendTwo).toBe(resendOne);
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledOnce();
    expect(client.auth.resend).toHaveBeenCalledOnce();

    resolveReset({ error: null });
    resolveResend({ error: null });
    await Promise.all([resetOne, resetTwo, resendOne, resendTwo]);
  });

  it("establishes only a token-backed recovery session and clears URL tokens", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#access_token=access-token&refresh_token=refresh-token&type=recovery",
    );
    const client = createClient();
    const service = createAuthService(() => client);

    await expect(service.establishPasswordRecovery()).resolves.toEqual({
      userId: "user-1",
    });
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(service.isPasswordRecoveryActive()).toBe(true);
    expect(window.location.hash).toBe("");
  });

  it("rejects an invalid recovery route before allowing a password update", async () => {
    window.history.replaceState({}, "", "/reset-password");
    const client = createClient();
    const service = createAuthService(() => client);

    await expect(service.establishPasswordRecovery()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.RECOVERY_LINK_INVALID,
    });
    await expect(
      service.completePasswordRecovery("Replacement123"),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.RECOVERY_LINK_INVALID });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("preserves an explicit request-rate error while establishing recovery", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#access_token=access-token&refresh_token=refresh-token&type=recovery",
    );
    const client = createClient();
    client.auth.setSession.mockResolvedValue({
      data: { session: null, user: null },
      error: {
        code: "over_request_rate_limit",
        status: 429,
        message: "Too many requests",
      },
    });
    const service = createAuthService(() => client);

    await expect(service.establishPasswordRecovery()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.REQUEST_RATE_LIMITED,
      message:
        "Too many requests were made in a short period. Please wait a few minutes and try again.",
    });
  });

  it("updates the recovery password and revokes the temporary session", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#access_token=access-token&refresh_token=refresh-token&type=recovery",
    );
    const client = createClient();
    const service = createAuthService(() => client);
    await service.establishPasswordRecovery();

    await service.completePasswordRecovery("Replacement123");

    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "Replacement123",
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(service.isPasswordRecoveryActive()).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("keeps a suspended account blocked after its password is recovered", async () => {
    window.history.replaceState(
      {},
      "",
      "/reset-password#access_token=access-token&refresh_token=refresh-token&type=recovery",
    );
    const client = createClient({
      profile: { ...activeProfile, account_status: "suspended" },
    });
    const service = createAuthService(() => client);
    await service.establishPasswordRecovery();
    await service.completePasswordRecovery("Replacement123");

    await expect(
      service.signIn({
        email: "maria@example.com",
        password: "Replacement123",
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PROFILE_SUSPENDED });
  });

  it("reauthenticates an active account before changing its password", async () => {
    const client = createClient();
    const service = createAuthService(() => client);

    await service.changePassword({
      currentPassword: "Current123",
      newPassword: "Replacement123",
    });

    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "maria@example.com",
      password: "Current123",
    });
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "Replacement123",
    });
  });

  it("restores a persisted session and validates the user with the server", async () => {
    const client = createClient();
    const service = createAuthService(() => client);

    const profile = await service.recoverSession();

    expect(profile.id).toBe("user-1");
    expect(client.auth.getSession).toHaveBeenCalledOnce();
    expect(client.auth.getUser).toHaveBeenCalledWith("access-token");
  });

  it("refreshes an expired session before loading the profile", async () => {
    const expiredSession = { ...validSession, expires_at: 1 };
    const client = createClient({ session: expiredSession });
    const service = createAuthService(() => client);

    await service.recoverSession();

    expect(client.auth.refreshSession).toHaveBeenCalledOnce();
    expect(client.auth.getUser).toHaveBeenCalledWith("access-token");
  });

  it("clears an expired session that cannot be refreshed", async () => {
    const client = createClient({
      session: { ...validSession, expires_at: 1 },
      refreshSession: null,
      refreshError: { status: 401, message: "Refresh token is invalid" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.INVALID_SESSION,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("preserves an expired local session during a temporary refresh failure", async () => {
    const client = createClient({
      session: { ...validSession, expires_at: 1 },
      refreshSession: null,
      refreshError: { status: 503, message: "Network connection timed out" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.RECOVERY_FAILED,
      recoverable: true,
    });
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("preserves a valid local session when server verification is temporarily offline", async () => {
    const client = createClient({
      getUserError: { status: 503, message: "Failed to fetch" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.RECOVERY_FAILED,
      recoverable: true,
    });
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("rejects a missing profile and clears the invalid local session", async () => {
    const client = createClient({ profile: null });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.PROFILE_MISSING,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects inactive accounts without retaining account state", async () => {
    const client = createClient({
      profile: { ...activeProfile, account_status: "inactive" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.PROFILE_INACTIVE,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps a self-registered pending Resident out of protected routes", async () => {
    const client = createClient({
      profile: {
        ...activeProfile,
        role: "resident",
        account_status: "invited",
      },
      registration: { status: "pending" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.PROFILE_PENDING,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("returns a safe rejected-registration state without protected access", async () => {
    const client = createClient({
      profile: {
        ...activeProfile,
        role: "resident",
        account_status: "invited",
      },
      registration: { status: "rejected" },
    });
    const service = createAuthService(() => client);

    await expect(
      service.signIn({
        email: "resident@example.com",
        password: "Secure123",
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.PROFILE_REJECTED });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("rejects suspended accounts and clears their local session", async () => {
    const client = createClient({
      profile: { ...activeProfile, account_status: "suspended" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.PROFILE_SUSPENDED,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("handles a deleted auth user as an invalid session", async () => {
    const client = createClient({
      getUserError: { status: 401, message: "User not found" },
    });
    const service = createAuthService(() => client);

    await expect(service.recoverSession()).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.INVALID_SESSION,
    });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("logs out locally even when no global network operation is needed", async () => {
    const client = createClient();
    const service = createAuthService(() => client);

    await service.signOut();

    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
