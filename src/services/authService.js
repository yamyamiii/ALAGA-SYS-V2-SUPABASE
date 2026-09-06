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
  RECOVERY_LINK_INVALID: "recovery_link_invalid",
  PASSWORD_UPDATE_FAILED: "password_update_failed",
  CURRENT_PASSWORD_INVALID: "current_password_invalid",
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
  [AUTH_ERROR_CODES.RECOVERY_LINK_INVALID]:
    "This password reset link is invalid or has expired. Request a new reset link.",
  [AUTH_ERROR_CODES.PASSWORD_UPDATE_FAILED]:
    "Your password could not be updated. Please try again.",
  [AUTH_ERROR_CODES.CURRENT_PASSWORD_INVALID]:
    "Your current password is incorrect.",
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

function mapPasswordUpdateError(error) {
  if (error instanceof AuthServiceError) return error;
  const rateLimitError = mapRateLimitError(error);
  if (rateLimitError) return rateLimitError;
  if (isNetworkError(error)) {
    return new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_FAILED, {
      cause: error,
      recoverable: true,
    });
  }
  return new AuthServiceError(AUTH_ERROR_CODES.PASSWORD_UPDATE_FAILED, {
    cause: error,
  });
}

function applicationRedirect(path) {
  return `${window.location.origin}${path}`;
}

function readRecoveryParameters() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const value = (name) => hash.get(name) ?? url.searchParams.get(name);
  return {
    url,
    type: value("type"),
    accessToken: value("access_token"),
    refreshToken: value("refresh_token"),
    code: url.searchParams.get("code"),
    tokenHash: value("token_hash"),
    error: value("error") ?? value("error_code"),
  };
}

function clearRecoveryParameters() {
  const url = new URL(window.location.href);
  for (const parameter of [
    "code",
    "token_hash",
    "type",
    "error",
    "error_code",
    "error_description",
  ]) {
    url.searchParams.delete(parameter);
  }
  url.hash = "";
  window.history.replaceState(window.history.state, "", url.toString());
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
  let recoveryUserId = null;
  let recoveryEstablishing = false;
  let passwordResetRequest = null;
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

    requestPasswordReset(email) {
      if (passwordResetRequest) return passwordResetRequest;
      passwordResetRequest = (async () => {
        try {
          let error;
          try {
            ({ error } = await client().auth.resetPasswordForEmail(
              email.trim(),
              {
                redirectTo: applicationRedirect(ROUTES.resetPassword),
              },
            ));
          } catch (requestError) {
            throw mapEmailDeliveryError(requestError);
          }
          if (error) throw mapEmailDeliveryError(error);
        } finally {
          passwordResetRequest = null;
        }
      })();
      return passwordResetRequest;
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

    async establishPasswordRecovery() {
      const parameters = readRecoveryParameters();
      const onRecoveryRoute = window.location.pathname === ROUTES.resetPassword;
      const implicitRecovery =
        parameters.type === "recovery" &&
        parameters.accessToken &&
        parameters.refreshToken;
      const otpRecovery =
        parameters.type === "recovery" && parameters.tokenHash;
      const pkceRecovery = Boolean(parameters.code);

      if (
        !onRecoveryRoute ||
        parameters.error ||
        (!implicitRecovery && !otpRecovery && !pkceRecovery)
      ) {
        if (
          onRecoveryRoute &&
          (parameters.error ||
            parameters.accessToken ||
            parameters.refreshToken ||
            parameters.code ||
            parameters.tokenHash)
        ) {
          clearRecoveryParameters();
        }
        throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID);
      }

      const supabaseClient = client();
      recoveryEstablishing = true;
      let establishedSession = false;
      try {
        let result;
        if (implicitRecovery) {
          result = await supabaseClient.auth.setSession({
            access_token: parameters.accessToken,
            refresh_token: parameters.refreshToken,
          });
        } else if (otpRecovery) {
          result = await supabaseClient.auth.verifyOtp({
            type: "recovery",
            token_hash: parameters.tokenHash,
          });
        } else {
          result = await supabaseClient.auth.exchangeCodeForSession(
            parameters.code,
          );
        }

        if (result.error || !result.data?.session?.user?.id) {
          const rateLimitError = mapRateLimitError(result.error);
          if (rateLimitError) throw rateLimitError;
          throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID, {
            cause: result.error,
          });
        }
        establishedSession = true;
        const { data: userData, error: userError } =
          await supabaseClient.auth.getUser(result.data.session.access_token);
        if (userError || userData.user?.id !== result.data.session.user.id) {
          throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID, {
            cause: userError,
          });
        }

        recoveryUserId = userData.user.id;
        clearRecoveryParameters();
        return Object.freeze({ userId: recoveryUserId });
      } catch (error) {
        recoveryUserId = null;
        clearRecoveryParameters();
        if (establishedSession) {
          try {
            await supabaseClient.auth.signOut({ scope: "local" });
          } finally {
            clearAuthStorage();
          }
        }
        if (error instanceof AuthServiceError) throw error;
        throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID, {
          cause: error,
        });
      } finally {
        recoveryEstablishing = false;
      }
    },

    isPasswordRecoveryActive() {
      return recoveryEstablishing || Boolean(recoveryUserId);
    },

    async completePasswordRecovery(newPassword) {
      if (!recoveryUserId) {
        throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID);
      }
      const supabaseClient = client();
      const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();
      if (userError || userData.user?.id !== recoveryUserId) {
        recoveryUserId = null;
        throw new AuthServiceError(AUTH_ERROR_CODES.RECOVERY_LINK_INVALID, {
          cause: userError,
        });
      }

      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (error) throw mapPasswordUpdateError(error);

      recoveryUserId = null;
      try {
        const { error: signOutError } = await supabaseClient.auth.signOut({
          scope: "global",
        });
        if (signOutError) {
          await supabaseClient.auth.signOut({ scope: "local" });
        }
      } finally {
        clearAuthStorage();
      }
    },

    async changePassword({ currentPassword, newPassword }) {
      const supabaseClient = client();
      const { data: userData, error: userError } =
        await supabaseClient.auth.getUser();
      if (userError || !userData.user?.email) {
        throw new AuthServiceError(AUTH_ERROR_CODES.INVALID_SESSION, {
          cause: userError,
        });
      }

      const { data: signInData, error: signInError } =
        await supabaseClient.auth.signInWithPassword({
          email: userData.user.email,
          password: currentPassword,
        });
      if (signInError || !signInData.session) {
        if (isNetworkError(signInError)) throw mapSignInError(signInError);
        throw new AuthServiceError(AUTH_ERROR_CODES.CURRENT_PASSWORD_INVALID, {
          cause: signInError,
        });
      }

      await validateSession(supabaseClient, signInData.session);
      const { error: updateError } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw mapPasswordUpdateError(updateError);
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
