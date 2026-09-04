import {
  clearAuthStorage,
  setAuthPersistence,
} from "@/lib/supabase/authStorage";
import {
  getSupabaseClient,
  SupabaseConfigurationError,
} from "@/lib/supabase/client";
import { ROUTES } from "@/config/routes";
import { isSupportedRole } from "@/features/auth/permissions";

export const AUTH_ERROR_CODES = Object.freeze({
  CONFIGURATION: "configuration_error",
  INVALID_CREDENTIALS: "invalid_credentials",
  EMAIL_NOT_CONFIRMED: "email_not_confirmed",
  EMAIL_SEND_RATE_LIMITED: "email_send_rate_limited",
  REQUEST_RATE_LIMITED: "request_rate_limited",
  INVALID_SESSION: "invalid_session",
  PROFILE_MISSING: "profile_missing",
  PROFILE_INVITED: "profile_invited",
  PROFILE_PENDING: "profile_pending",
  PROFILE_REJECTED: "profile_rejected",
  PROFILE_INACTIVE: "profile_inactive",
  PROFILE_SUSPENDED: "profile_suspended",
  INVALID_ROLE: "invalid_role",
  RECOVERY_FAILED: "recovery_failed",
  UNKNOWN: "unknown",
});

const ERROR_MESSAGES = Object.freeze({
  [AUTH_ERROR_CODES.CONFIGURATION]:
    "Authentication is not configured for this environment.",
  [AUTH_ERROR_CODES.INVALID_CREDENTIALS]:
    "The email or password you entered is incorrect.",
  [AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED]:
    "Please confirm your email address before signing in.",
  [AUTH_ERROR_CODES.EMAIL_SEND_RATE_LIMITED]:
    "Email sending is temporarily limited. Please wait a few minutes and try again. Your registration information was not lost if the account was already created.",
  [AUTH_ERROR_CODES.REQUEST_RATE_LIMITED]:
    "Too many requests were made in a short period. Please wait a few minutes and try again.",
  [AUTH_ERROR_CODES.INVALID_SESSION]:
    "Your session is no longer valid. Please sign in again.",
  [AUTH_ERROR_CODES.PROFILE_MISSING]:
    "Your account does not have an ALAGA-SYS profile. Contact an administrator.",
  [AUTH_ERROR_CODES.PROFILE_INVITED]:
    "Your account invitation has not been activated yet.",
  [AUTH_ERROR_CODES.PROFILE_PENDING]:
    "Your Resident registration is pending Administrator verification.",
  [AUTH_ERROR_CODES.PROFILE_REJECTED]:
    "Your Resident registration was not approved. Contact the Barangay Health Center for assistance.",
  [AUTH_ERROR_CODES.PROFILE_INACTIVE]:
    "Your account is inactive. Contact an administrator for assistance.",
  [AUTH_ERROR_CODES.PROFILE_SUSPENDED]:
    "Your account has been suspended. Contact an administrator for assistance.",
  [AUTH_ERROR_CODES.INVALID_ROLE]:
    "Your account has an unsupported role. Contact an administrator.",
  [AUTH_ERROR_CODES.RECOVERY_FAILED]:
    "We could not verify your session. Check your connection and try again.",
  [AUTH_ERROR_CODES.UNKNOWN]:
    "Authentication could not be completed. Please try again.",
});

export class AuthServiceError extends Error {
  constructor(code, options = {}) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES[AUTH_ERROR_CODES.UNKNOWN], {
      cause: options.cause,
    });
    this.name = "AuthServiceError";
    this.code = code;
    this.recoverable = options.recoverable ?? false;
  }
}

function isNetworkError(error) {
  return (
    error?.status >= 500 ||
    /fetch|network|timeout|connection/i.test(error?.message ?? "")
  );
}

function mapRateLimitError(error) {
  if (error?.code === "over_email_send_rate_limit") {
    return new AuthServiceError(AUTH_ERROR_CODES.EMAIL_SEND_RATE_LIMITED, {
      cause: error,
    });
  }
  if (error?.code === "over_request_rate_limit") {
    return new AuthServiceError(AUTH_ERROR_CODES.REQUEST_RATE_LIMITED, {
      cause: error,
    });
  }
  if (error?.status === 429) {
    return new AuthServiceError(AUTH_ERROR_CODES.REQUEST_RATE_LIMITED, {
      cause: error,
    });
  }
  return null;
}

function mapSignInError(error) {
  if (error instanceof SupabaseConfigurationError) {
    return new AuthServiceError(AUTH_ERROR_CODES.CONFIGURATION, {
      cause: error,
    });
  }
  if (isNetworkError(error)) {
    return new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
      cause: error,
      recoverable: true,
    });
  }
  const rateLimitError = mapRateLimitError(error);
  if (rateLimitError) return rateLimitError;
  if (
    error?.code === "email_not_confirmed" ||
    /email not confirmed/i.test(error?.message ?? "")
  ) {
    return new AuthServiceError(AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED, {
      cause: error,
    });
  }
  if (
    error?.status === 400 ||
    /invalid login credentials/i.test(error?.message ?? "")
  ) {
    return new AuthServiceError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, {
      cause: error,
    });
  }
  return new AuthServiceError(AUTH_ERROR_CODES.UNKNOWN, { cause: error });
}

function mapEmailDeliveryError(error) {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof SupabaseConfigurationError) {
    return new AuthServiceError(AUTH_ERROR_CODES.CONFIGURATION, {
      cause: error,
    });
  }
  const rateLimitError = mapRateLimitError(error);
  if (rateLimitError) return rateLimitError;
  if (/email rate/i.test(error?.message ?? "")) {
    return new AuthServiceError(AUTH_ERROR_CODES.EMAIL_SEND_RATE_LIMITED, {
      cause: error,
    });
  }
  if (/rate limit|too many requests/i.test(error?.message ?? "")) {
    return new AuthServiceError(AUTH_ERROR_CODES.REQUEST_RATE_LIMITED, {
      cause: error,
    });
  }
  if (isNetworkError(error)) {
    return new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
      cause: error,
      recoverable: true,
    });
  }
  return new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
    cause: error,
    recoverable: true,
  });
}

function applicationRedirect(path) {
  return `${window.location.origin}${path}`;
}

function accountStatusError(status) {
  const code = {
    invited: AUTH_ERROR_CODES.PROFILE_INVITED,
    inactive: AUTH_ERROR_CODES.PROFILE_INACTIVE,
    suspended: AUTH_ERROR_CODES.PROFILE_SUSPENDED,
  }[status];
  return code ? new AuthServiceError(code) : null;
}

export function createAuthService(clientProvider = getSupabaseClient) {
  let confirmationResendRequest = null;

  function client() {
    try {
      return clientProvider();
    } catch (error) {
      if (error instanceof SupabaseConfigurationError) {
        throw new AuthServiceError(AUTH_ERROR_CODES.CONFIGURATION, {
          cause: error,
        });
      }
      throw error;
    }
  }

  async function clearInvalidSession(supabaseClient) {
    try {
      await supabaseClient.auth.signOut({ scope: "local" });
    } finally {
      clearAuthStorage();
    }
  }

  async function loadProfile(supabaseClient, userId) {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, role, first_name, last_name, avatar_path, account_status")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
        cause: error,
        recoverable: true,
      });
    }
    if (!data) throw new AuthServiceError(AUTH_ERROR_CODES.PROFILE_MISSING);

    if (data.account_status === "invited" && data.role === "resident") {
      const { data: registration, error: registrationError } =
        await supabaseClient
          .from("resident_registration_requests")
          .select("status")
          .eq("profile_id", userId)
          .maybeSingle();
      if (registrationError) {
        throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
          cause: registrationError,
          recoverable: true,
        });
      }
      if (registration?.status === "pending") {
        throw new AuthServiceError(AUTH_ERROR_CODES.PROFILE_PENDING);
      }
      if (registration?.status === "rejected") {
        throw new AuthServiceError(AUTH_ERROR_CODES.PROFILE_REJECTED);
      }
    }

    const statusError = accountStatusError(data.account_status);
    if (statusError) throw statusError;
    if (data.account_status !== "active" || !isSupportedRole(data.role)) {
      throw new AuthServiceError(AUTH_ERROR_CODES.INVALID_ROLE);
    }

    return Object.freeze({
      id: data.id,
      role: data.role,
      first_name: data.first_name,
      last_name: data.last_name,
      avatar: data.avatar_path,
    });
  }

  async function validateSession(supabaseClient, session) {
    if (!session?.user?.id) return null;

    let activeSession = session;
    const expiresSoon =
      !session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
    if (expiresSoon) {
      const { data, error } = await supabaseClient.auth.refreshSession();
      if (error || !data.session) {
        if (isNetworkError(error)) {
          throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
            cause: error,
            recoverable: true,
          });
        }
        await clearInvalidSession(supabaseClient);
        throw new AuthServiceError(AUTH_ERROR_CODES.INVALID_SESSION, {
          cause: error,
        });
      }
      activeSession = data.session;
    }

    const { data: userData, error: userError } =
      await supabaseClient.auth.getUser(activeSession.access_token);
    if (
      userError ||
      !userData.user ||
      userData.user.id !== activeSession.user.id
    ) {
      if (isNetworkError(userError)) {
        throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
          cause: userError,
          recoverable: true,
        });
      }
      await clearInvalidSession(supabaseClient);
      throw new AuthServiceError(AUTH_ERROR_CODES.INVALID_SESSION, {
        cause: userError,
      });
    }

    try {
      return await loadProfile(supabaseClient, userData.user.id);
    } catch (error) {
      if (error instanceof AuthServiceError && !error.recoverable) {
        await clearInvalidSession(supabaseClient);
      }
      throw error;
    }
  }

  return {
    async signIn({ email, password, remember = false }) {
      setAuthPersistence(remember);
      let supabaseClient;
      try {
        supabaseClient = client();
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.session) throw mapSignInError(error);
        return await validateSession(supabaseClient, data.session);
      } catch (error) {
        if (error instanceof AuthServiceError) throw error;
        throw mapSignInError(error);
      }
    },

    resendConfirmation(email) {
      if (confirmationResendRequest) return confirmationResendRequest;
      confirmationResendRequest = (async () => {
        try {
          let error;
          try {
            ({ error } = await client().auth.resend({
              type: "signup",
              email: email.trim(),
              options: {
                emailRedirectTo: applicationRedirect(ROUTES.login),
              },
            }));
          } catch (requestError) {
            throw mapEmailDeliveryError(requestError);
          }
          if (error) throw mapEmailDeliveryError(error);
        } finally {
          confirmationResendRequest = null;
        }
      })();
      return confirmationResendRequest;
    },

    async recoverSession() {
      const supabaseClient = client();
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) {
        if (isNetworkError(error)) {
          throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
            cause: error,
            recoverable: true,
          });
        }
        await clearInvalidSession(supabaseClient);
        throw new AuthServiceError(AUTH_ERROR_CODES.INVALID_SESSION, {
          cause: error,
        });
      }
      return validateSession(supabaseClient, data.session);
    },

    async signOut() {
      try {
        await client().auth.signOut({ scope: "local" });
      } finally {
        clearAuthStorage();
      }
    },

    onAuthStateChange(callback) {
      try {
        return client().auth.onAuthStateChange(callback).data.subscription;
      } catch (error) {
        if (error instanceof AuthServiceError) return null;
        throw error;
      }
    },
  };
}

export const authService = createAuthService();
