import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingState } from "@/components/common/StateDisplay";
import { AppShell } from "@/components/layout/AppShell";
import {
  FINAL_SCOPE_REPORT_ROLES,
  HIDDEN_FINAL_SCOPE_ROUTES,
} from "@/config/finalScope";
import { ROUTES } from "@/config/routes";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { PERMISSIONS } from "@/features/auth/permissions";
import { RoleGuard } from "@/features/auth/RoleGuard";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AccessDeniedPage = lazy(() => import("@/pages/AccessDeniedPage"));
const AccountSettingsPage = lazy(() => import("@/pages/AccountSettingsPage"));
const UserManagementPage = lazy(
  () => import("@/features/user-management/UserManagementPage"),
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
const ReportsPage = lazy(() => import("@/features/reports/ReportsPage"));
const AnnouncementsPage = lazy(
  () => import("@/features/assistance/AnnouncementsPage"),
);
const NotificationsPage = lazy(
  () => import("@/features/assistance/NotificationsPage"),
);
const HealthCenterPage = lazy(
  () => import("@/features/assistance/HealthCenterPage"),
);
const FaqPage = lazy(() => import("@/features/assistance/FaqPage"));
const ContactPage = lazy(() => import("@/features/assistance/ContactPage"));
const ConfigurationErrorPage = lazy(
  () => import("@/pages/ConfigurationErrorPage"),
);
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

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
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENT_CALENDAR}>
                  <AppointmentCalendarPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.appointmentQueue}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_APPOINTMENT_QUEUE}>
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
            <Route
              path={ROUTES.reports}
              element={
                <RoleGuard roles={FINAL_SCOPE_REPORT_ROLES}>
                  <ReportsPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.announcements}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_ANNOUNCEMENTS}>
                  <AnnouncementsPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.notifications}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_NOTIFICATIONS}>
                  <NotificationsPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.healthCenter}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_HEALTH_CENTER}>
                  <HealthCenterPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.faq}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_FAQ}>
                  <FaqPage />
                </RoleGuard>
              }
            />
            <Route
              path={ROUTES.contact}
              element={
                <RoleGuard permission={PERMISSIONS.VIEW_INQUIRIES}>
                  <ContactPage />
                </RoleGuard>
              }
            />
            {HIDDEN_FINAL_SCOPE_ROUTES.map((path) => (
              <Route
                key={path}
                path={path}
                element={<Navigate to={ROUTES.accessDenied} replace />}
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
