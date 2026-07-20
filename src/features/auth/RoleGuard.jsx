import { Navigate, Outlet, useLocation } from "react-router-dom";

import { ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth/authContext";

export function RoleGuard({ permission, roles, children }) {
  const auth = useAuth();
  const location = useLocation();
  const authorized = permission
    ? auth.can(permission)
    : auth.hasRole(roles ?? []);

  if (!authorized) {
    return (
      <Navigate
        to={ROUTES.accessDenied}
        replace
        state={{ attemptedPath: location.pathname }}
      />
    );
  }

  return children ?? <Outlet />;
}
