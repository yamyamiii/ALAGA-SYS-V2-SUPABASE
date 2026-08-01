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
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: profile,
    error: profileError,
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
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
        data: { user: getUserError ? null : { id: "user-1" } },
        error: getUserError,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(() => ({ select })),
  };
  return client;
}

describe("auth service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
