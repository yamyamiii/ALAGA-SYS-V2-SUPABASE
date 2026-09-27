import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthContext } from "@/features/auth/authContext";
import { hasPermission, hasRole } from "@/features/auth/permissions";
import { ROUTES } from "@/config/routes";
import { queryClient } from "@/lib/query/client";
import {
  AUTH_ERROR_CODES,
  AuthServiceError,
  authService,
} from "@/services/authService";

const initialState = {
  status: "loading",
  profile: null,
  pendingProfileId: null,
  error: null,
};

function reportAuthDiagnostic(category, error) {
  console.warn("[ALAGA-SYS auth diagnostic]", {
    category,
    code: error?.code ?? AUTH_ERROR_CODES.UNKNOWN,
    recoverable: Boolean(error?.recoverable),
  });
}

export function AuthProvider({ children }) {
  const [state, setState] = useState(initialState);
  const requestId = useRef(0);

  const recover = useCallback(async ({ silent = false, reason } = {}) => {
    const currentRequest = ++requestId.current;
    if (!silent) {
      setState((current) => ({ ...current, status: "loading", error: null }));
    }
    try {
      const profile = await authService.recoverSession();
      if (currentRequest !== requestId.current) return;
      if (!profile) queryClient.clear();
      setState({
        status: profile ? "authenticated" : "unauthenticated",
        profile,
        pendingProfileId: null,
        error: null,
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      if (
        error instanceof AuthServiceError &&
        [AUTH_ERROR_CODES.PROFILE_PENDING].includes(error.code)
      ) {
        queryClient.clear();
        setState({
          status: "pending",
          profile: null,
          pendingProfileId: error.profileId,
          error: null,
        });
        return;
      }
      if (
        error instanceof AuthServiceError &&
        [
          AUTH_ERROR_CODES.PROFILE_REJECTED,
          AUTH_ERROR_CODES.PROFILE_INACTIVE,
          AUTH_ERROR_CODES.PROFILE_SUSPENDED,
          AUTH_ERROR_CODES.PROFILE_MISSING,
          AUTH_ERROR_CODES.INVALID_ROLE,
          AUTH_ERROR_CODES.INVALID_SESSION,
        ].includes(error.code)
      ) {
        queryClient.clear();
        setState({
          status: "unauthenticated",
          profile: null,
          pendingProfileId: null,
          error: null,
        });
        return;
      }
      if (silent && error instanceof AuthServiceError && error.recoverable) {
        reportAuthDiagnostic(reason ?? "session_revalidation_deferred", error);
        setState((current) =>
          ["authenticated", "pending"].includes(current.status)
            ? { ...current, error }
            : {
                status: "error",
                profile: null,
                pendingProfileId: null,
                error,
              },
        );
        return;
      }
      queryClient.clear();
      reportAuthDiagnostic(reason ?? "session_recovery_failed", error);
      const configurationError =
        error instanceof AuthServiceError &&
        error.code === AUTH_ERROR_CODES.CONFIGURATION;
      setState({
        status: configurationError ? "configuration-error" : "error",
        profile: null,
        pendingProfileId: null,
        error,
      });
    }
  }, []);

  useEffect(() => {
    if (!["authenticated", "pending"].includes(state.status)) return undefined;

    const revalidate = () =>
      recover({ silent: true, reason: "periodic_or_focus_revalidation" });
    const interval = window.setInterval(revalidate, 5 * 60 * 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [recover, state.status]);

  useEffect(() => {
    let active = true;
    if (window.location.pathname === ROUTES.resetPassword) {
      setState({
        status: "unauthenticated",
        profile: null,
        pendingProfileId: null,
        error: null,
      });
    } else {
      recover();
    }

    const subscription = authService.onAuthStateChange((event) => {
      if (!active || event === "INITIAL_SESSION") return;
      if (
        event === "PASSWORD_RECOVERY" ||
        authService.isPasswordRecoveryActive?.()
      ) {
        return;
      }
      if (
        ["SIGNED_OUT", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(
          event,
        )
      ) {
        window.setTimeout(() => {
          if (active) {
            recover({
              silent: true,
              reason:
                event === "SIGNED_OUT"
                  ? "signed_out_event_confirmation"
                  : "auth_event_revalidation",
            });
          }
        }, 0);
      }
    });

    return () => {
      active = false;
      requestId.current += 1;
      subscription?.unsubscribe();
    };
  }, [recover]);

  const signIn = useCallback(async (credentials) => {
    const currentRequest = ++requestId.current;
    try {
      const profile = await authService.signIn(credentials);
      if (currentRequest === requestId.current) {
        setState({
          status: "authenticated",
          profile,
          pendingProfileId: null,
          error: null,
        });
      }
      return profile;
    } catch (error) {
      if (
        currentRequest === requestId.current &&
        error instanceof AuthServiceError &&
        error.code === AUTH_ERROR_CODES.PROFILE_PENDING
      ) {
        setState({
          status: "pending",
          profile: null,
          pendingProfileId: error.profileId,
          error: null,
        });
      }
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    requestId.current += 1;
    setState({
      status: "loading",
      profile: null,
      pendingProfileId: null,
      error: null,
    });
    try {
      await authService.signOut();
    } finally {
      queryClient.clear();
      setState({
        status: "unauthenticated",
        profile: null,
        pendingProfileId: null,
        error: null,
      });
    }
  }, []);

  const refreshProfile = useCallback(
    () => recover({ silent: true, reason: "realtime_profile_revalidation" }),
    [recover],
  );

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === "authenticated",
      signIn,
      signOut,
      retry: recover,
      refreshProfile,
      can: (permission) => hasPermission(state.profile?.role, permission),
      hasRole: (roles) => hasRole(state.profile?.role, roles),
    }),
    [recover, refreshProfile, signIn, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { useAuth } from "@/features/auth/authContext";
