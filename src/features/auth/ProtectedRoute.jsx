import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AuthLoadingScreen } from "@/features/auth/AuthLoadingScreen";
import { useAuth } from "@/features/auth/authContext";
import { ROUTES } from "@/config/routes";

export function ProtectedRoute({ children }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") return <AuthLoadingScreen />;
  if (auth.status === "configuration-error") {
    return <Navigate to={ROUTES.configurationError} replace />;
  }
  if (auth.status === "error") {
    return <AuthLoadingScreen error={auth.error} onRetry={auth.retry} />;
  }
  if (!auth.isAuthenticated) {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return children ?? <Outlet />;
}
