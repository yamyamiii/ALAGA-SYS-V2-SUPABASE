import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthContext } from "@/features/auth/authContext";
import { hasPermission, hasRole } from "@/features/auth/permissions";
import { queryClient } from "@/lib/query/client";
import {
  AUTH_ERROR_CODES,
  AuthServiceError,
  authService,
} from "@/services/authService";

const initialState = {
  status: "loading",
  profile: null,
  error: null,
};

export function AuthProvider({ children }) {
  const [state, setState] = useState(initialState);
  const requestId = useRef(0);

  const recover = useCallback(async ({ silent = false } = {}) => {
    const currentRequest = ++requestId.current;
    if (!silent) {
      setState((current) => ({ ...current, status: "loading", error: null }));
    }
    try {
      const profile = await authService.recoverSession();
      if (currentRequest !== requestId.current) return;
      setState({
        status: profile ? "authenticated" : "unauthenticated",
        profile,
        error: null,
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      const configurationError =
        error instanceof AuthServiceError &&
        error.code === AUTH_ERROR_CODES.CONFIGURATION;
      setState({
        status: configurationError ? "configuration-error" : "error",
        profile: null,
        error,
      });
    }
  }, []);

  useEffect(() => {
    if (state.status !== "authenticated") return undefined;

    const revalidate = () => recover({ silent: true });
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
    recover();

    const subscription = authService.onAuthStateChange((event) => {
      if (!active || event === "INITIAL_SESSION") return;
      if (event === "SIGNED_OUT") {
        requestId.current += 1;
        queryClient.clear();
        setState({ status: "unauthenticated", profile: null, error: null });
        return;
      }
      if (["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
        window.setTimeout(() => {
          if (active) recover();
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
    const profile = await authService.signIn(credentials);
    if (currentRequest === requestId.current) {
      setState({ status: "authenticated", profile, error: null });
    }
    return profile;
  }, []);

  const signOut = useCallback(async () => {
    requestId.current += 1;
    setState({ status: "loading", profile: null, error: null });
    try {
      await authService.signOut();
    } finally {
      queryClient.clear();
      setState({ status: "unauthenticated", profile: null, error: null });
    }
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      isAuthenticated: state.status === "authenticated",
      signIn,
      signOut,
      retry: recover,
      refreshProfile: () => recover({ silent: true }),
      can: (permission) => hasPermission(state.profile?.role, permission),
      hasRole: (roles) => hasRole(state.profile?.role, roles),
    }),
    [recover, signIn, signOut, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { useAuth } from "@/features/auth/authContext";
