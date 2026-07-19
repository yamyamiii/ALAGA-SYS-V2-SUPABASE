import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingState } from "@/components/common/StateDisplay";
import { AppShell } from "@/components/layout/AppShell";
import { ROUTES } from "@/config/routes";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ComingSoonPage = lazy(() => import("@/pages/ComingSoonPage"));
const ConfigurationErrorPage = lazy(
  () => import("@/pages/ConfigurationErrorPage"),
);
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

const placeholderRoutes = [
  ROUTES.residents,
  ROUTES.appointments,
  ROUTES.healthRecords,
  ROUTES.maternalChildCare,
  ROUTES.medicineInventory,
  ROUTES.announcements,
  ROUTES.reports,
  ROUTES.auditLogs,
  ROUTES.userManagement,
  ROUTES.settings,
];

function RouteFallback() {
  return (
    <div className="p-6">
      <LoadingState
        title="Loading page"
        description="Preparing the workspace…"
      />
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          {placeholderRoutes.map((path) => (
            <Route key={path} path={path} element={<ComingSoonPage />} />
          ))}
          <Route
            path={ROUTES.configurationError}
            element={<ConfigurationErrorPage />}
          />
        </Route>
        <Route
          path="/dashboard"
          element={<Navigate to={ROUTES.dashboard} replace />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
