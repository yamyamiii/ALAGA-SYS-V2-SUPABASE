import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingState } from "@/components/common/StateDisplay";
import { AppShell } from "@/components/layout/AppShell";
import { navigationItems } from "@/config/navigation";
import { ROUTES } from "@/config/routes";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { PERMISSIONS } from "@/features/auth/permissions";
import { RoleGuard } from "@/features/auth/RoleGuard";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const ComingSoonPage = lazy(() => import("@/pages/ComingSoonPage"));
const AccessDeniedPage = lazy(() => import("@/pages/AccessDeniedPage"));
const AccountSettingsPage = lazy(() => import("@/pages/AccountSettingsPage"));
const UserManagementPage = lazy(
  () => import("@/features/user-management/UserManagementPage"),
);
const HouseholdRegistryPage = lazy(
  () => import("@/features/registry/HouseholdRegistryPage"),
);
const ResidentRegistryPage = lazy(
  () => import("@/features/registry/ResidentRegistryPage"),
);
const AppointmentListPage = lazy(
  () => import("@/features/appointments/AppointmentListPage"),
);
const AppointmentCalendarPage = lazy(
  () => import("@/features/appointments/AppointmentCalendarPage"),
);
const AppointmentQueuePage = lazy(
  () => import("@/features/appointments/AppointmentQueuePage"),
);
const HealthRecordsPage = lazy(
  () => import("@/features/health-records/HealthRecordsPage"),
);
const HealthRecordDetailPage = lazy(
  () => import("@/features/health-records/HealthRecordDetailPage"),
);
const ConfigurationErrorPage = lazy(
  () => import("@/pages/ConfigurationErrorPage"),
);
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

const moduleRoutes = navigationItems.filter(
  (item) =>
    item.path !== ROUTES.dashboard &&
    item.path !== ROUTES.userManagement &&
    item.path !== ROUTES.households &&
    item.path !== ROUTES.residents &&
    item.path !== ROUTES.appointments &&
    item.path !== ROUTES.healthRecords,
);

function RouteFallback() {
  return (
    <div className="p-6">
      <LoadingState
        title="Loading page"
        description="Preparing the secure workspace…"
      />
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path={ROUTES.login} element={<LoginPage />} />
        <Route
          path={ROUTES.configurationError}
          element={<ConfigurationErrorPage />}
        />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path={ROUTES.account} element={<AccountSettingsPage />} />
            <Route path={ROUTES.accessDenied} element={<AccessDeniedPage />} />
            <Route
              path={ROUTES.households}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_HOUSEHOLDS}>
                  <HouseholdRegistryPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.residents}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_RESIDENTS}>
                  <ResidentRegistryPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.userManagement}
              element={
                <RoleGuard permission={PERMISSIONS.MANAGE_USERS}>
                  <UserManagementPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.appointments}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENTS}>
                  <AppointmentListPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.appointmentCalendar}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENTS}>
                  <AppointmentCalendarPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.appointmentQueue}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENTS}>
                  <AppointmentQueuePage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.healthRecords}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_HEALTH_RECORDS}>
                  <HealthRecordsPage />
                </RoleGuard>
              }
            />
            <Route
              path="/health-records/:encounterId"
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_HEALTH_RECORDS}>
                  <HealthRecordDetailPage />
                </RoleGuard>
              }
            />
            {moduleRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <RoleGuard permission={route.permission}>
                    <ComingSoonPage />
                  </RoleGuard>
                }
              />
            ))}
            <Route
              path="dashboard"
              element={<Navigate to={ROUTES.dashboard} replace />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
