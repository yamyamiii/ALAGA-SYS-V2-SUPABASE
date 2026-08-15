import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CircleCheckBig,
  HeartPulse,
  Megaphone,
  MessageCircleMore,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { LiveManilaClock } from "@/components/common/LiveManilaClock";
import { PageHeading } from "@/components/common/PageHeading";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isFinalScopeReportRole } from "@/config/finalScope";
import { ROUTES } from "@/config/routes";
import {
  useAnnouncements,
  useNotifications,
} from "@/features/assistance/hooks";
import {
  APPOINTMENT_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/features/appointments/constants";
import {
  useAppointmentDashboard,
  useAppointmentQueue,
} from "@/features/appointments/hooks";
import {
  formatManilaTime,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import {
  hasPermission,
  PERMISSIONS,
  USER_ROLES,
} from "@/features/auth/permissions";
import { openAiAssistant } from "@/features/ai-assistant/launcher";
import { useDashboardSummary } from "@/features/reports/hooks";

const STAFF_ROLES = [
  USER_ROLES.ADMINISTRATOR,
  USER_ROLES.BARANGAY_HEALTH_WORKER,
  USER_ROLES.NURSE,
  USER_ROLES.MIDWIFE,
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const today = manilaDateKey();
  const reportRole = isFinalScopeReportRole(profile.role);
  const residentView = profile.role === USER_ROLES.RESIDENT;
  const staffView = STAFF_ROLES.includes(profile.role);
  const clinicalStaffView = [USER_ROLES.NURSE, USER_ROLES.MIDWIFE].includes(
    profile.role,
  );
  const registryRole = [
    USER_ROLES.ADMINISTRATOR,
    USER_ROLES.BARANGAY_HEALTH_WORKER,
  ].includes(profile.role);
  const appointmentSummary = useAppointmentDashboard(!reportRole);
  const reportSummary = useDashboardSummary(today, reportRole);
  const summary = reportRole ? reportSummary : appointmentSummary;
  const summaryData = reportRole ? reportSummary.data : appointmentSummary.data;
  const queue = useAppointmentQueue(
    { date: today, page: 1, pageSize: 5 },
    { poll: false, enabled: staffView },
  );
  const canSchedule = hasPermission(
    profile.role,
    PERMISSIONS.SCHEDULE_APPOINTMENTS,
  );
  const canManageResidents = hasPermission(
    profile.role,
    PERMISSIONS.MANAGE_RESIDENTS,
  );
  const canManageAnnouncements = hasPermission(
    profile.role,
    PERMISSIONS.MANAGE_ANNOUNCEMENTS,
  );
  const latestAnnouncement = useAnnouncements({
    search: "",
    category: "",
    include_archived: false,
    page: 1,
    page_size: 10,
  });
  const notifications = useNotifications(
    {
      unread_only: false,
      page: 1,
      page_size: 10,
    },
    residentView,
  );

  const appointmentStats = residentView
    ? [
        {
          label: "My appointments today",
          icon: CalendarCheck,
          value: summaryData?.appointments_today,
          helper: "Appointments linked to your account",
        },
        {
          label: "Pending requests",
          icon: CalendarClock,
          value: summaryData?.pending_appointments,
          helper: "Awaiting health-center review",
        },
        {
          label: "Upcoming appointments",
          icon: UsersRound,
          value: summaryData?.upcoming_appointments,
          helper: "Pending or confirmed future schedule",
        },
        {
          label: "Completed visits today",
          icon: CircleCheckBig,
          value: summaryData?.completed_today,
          helper: "Completed on the Asia/Manila business date",
        },
      ]
    : [
        ...(registryRole
          ? [
              {
                label: "Active residents",
                icon: UsersRound,
                value: summaryData?.active_residents,
                helper: "Active resident registry",
              },
            ]
          : []),
        {
          label: reportRole ? "Total appointments" : "Assigned appointments",
          icon: CalendarCheck,
          value:
            summaryData?.total_appointments ??
            summaryData?.assigned_appointments ??
            summaryData?.appointments_today,
          helper: reportRole
            ? "All authorized non-archived appointments"
            : "Authorized appointment workload",
        },
        {
          label: clinicalStaffView ? "Upcoming assigned" : "Pending requests",
          icon: CalendarClock,
          value: clinicalStaffView
            ? summaryData?.upcoming_appointments
            : (summaryData?.pending_requests ??
              summaryData?.pending_appointments),
          helper: clinicalStaffView
            ? "Future pending or confirmed assignments"
            : "Awaiting action",
        },
        {
          label: "Today's schedule",
          icon: CircleCheckBig,
          value: summaryData?.appointments_today,
          helper: "Asia/Manila business date",
        },
      ];

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Appointment and general assistance"
        title={residentView ? "Good day" : "Good day, Barangay Health Team"}
        description="Appointment information reflects only records authorized for your account."
        actions={<LiveManilaClock />}
      />

      <section
        aria-label="Appointment statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {appointmentStats.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={summary.isLoading} />
        ))}
      </section>

      {staffView ? (
        <section className="grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-3">
            <CardHeader>
              <SectionHeading
                title={
                  registryRole
                    ? "Appointment operations"
                    : "Assigned appointment workflow"
                }
                description="Verified scheduling totals from authorized records"
                action={<Badge variant="outline">Live</Badge>}
              />
            </CardHeader>
            <CardContent>
              {summary.isError ? (
                <EmptyState
                  title="Appointment totals unavailable"
                  description={summary.error.message}
                  actionLabel="Try again"
                  onAction={() => summary.refetch()}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {appointmentStats.map((stat) => (
                    <div key={stat.label} className="rounded-xl border p-4">
                      <p className="text-sm text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold">
                        {summary.isLoading ? "…" : (stat.value ?? "—")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <SectionHeading
                title="Today's queue"
                description="First five appointments in operational order"
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to={ROUTES.appointmentQueue}>Open queue</Link>
                  </Button>
                }
              />
            </CardHeader>
            <CardContent>
              {queue.isError ? (
                <EmptyState
                  compact
                  title="Today's queue unavailable"
                  description={queue.error.message}
                  actionLabel="Try again"
                  onAction={() => queue.refetch()}
                />
              ) : queue.data?.items?.length ? (
                <div className="divide-y rounded-xl border">
                  {queue.data.items.map((item) => (
                    <Link
                      key={item.id}
                      to={ROUTES.appointmentQueue}
                      className="flex min-h-11 items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.resident_name}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatManilaTime(item.start_time)} ·{" "}
                          {item.service_type}
                        </p>
                      </div>
                      <Badge
                        variant={
                          item.priority === "urgent"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {PRIORITY_LABELS[item.priority]} ·{" "}
                        {APPOINTMENT_STATUS_LABELS[item.status]}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  title={
                    queue.isLoading
                      ? "Loading today's queue"
                      : "No appointments today"
                  }
                  description={
                    queue.isLoading
                      ? "Retrieving the authorized daily queue."
                      : "The operational queue is currently empty."
                  }
                />
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeading
              title="Latest announcement"
              description="Current health center and barangay advisory"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to={ROUTES.announcements}>View all</Link>
                </Button>
              }
            />
          </CardHeader>
          <CardContent>
            {latestAnnouncement.isLoading ? (
              <LoadingState compact title="Loading latest announcement" />
            ) : latestAnnouncement.isError ? (
              <ErrorState
                compact
                title="Announcement unavailable"
                description={latestAnnouncement.error.message}
                actionLabel="Try again"
                onAction={() => latestAnnouncement.refetch()}
              />
            ) : latestAnnouncement.data?.items?.[0] ? (
              <div className="rounded-xl border p-4">
                <p className="font-semibold">
                  {latestAnnouncement.data.items[0].title}
                </p>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {latestAnnouncement.data.items[0].content}
                </p>
              </div>
            ) : (
              <EmptyState
                compact
                title="No current announcements"
                description="Published community updates will appear here."
              />
            )}
          </CardContent>
        </Card>

        {residentView ? (
          <Card>
            <CardHeader>
              <SectionHeading
                title="Notifications"
                description={`${notifications.data?.unread ?? 0} unread in-app updates`}
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link to={ROUTES.notifications}>Open notifications</Link>
                  </Button>
                }
              />
            </CardHeader>
            <CardContent>
              {notifications.isLoading ? (
                <LoadingState compact title="Loading notifications" />
              ) : notifications.isError ? (
                <ErrorState
                  compact
                  title="Notifications unavailable"
                  description={notifications.error.message}
                  actionLabel="Try again"
                  onAction={() => notifications.refetch()}
                />
              ) : notifications.data?.items?.[0] ? (
                <div className="rounded-xl border p-4">
                  <p className="font-semibold">
                    {notifications.data.items[0].title}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {notifications.data.items[0].summary}
                  </p>
                </div>
              ) : (
                <EmptyState
                  compact
                  title="No notifications"
                  description="Relevant updates will appear here."
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <SectionHeading
              title="Quick actions"
              description="Available actions follow your role permissions"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {residentView || canSchedule ? (
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-start font-medium"
              >
                <Link to={ROUTES.appointments}>
                  <CalendarCheck />
                  {residentView ? "Request appointment" : "New appointment"}
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-start font-medium"
              >
                <Link to={ROUTES.appointments}>
                  <CalendarCheck /> Open assigned appointments
                </Link>
              </Button>
            )}
            {canManageResidents ? (
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-start font-medium"
              >
                <Link to={ROUTES.residents}>
                  <UsersRound /> Add resident
                </Link>
              </Button>
            ) : null}
            {!residentView ? (
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-start font-medium"
              >
                <Link to={ROUTES.healthRecords}>
                  <HeartPulse /> Health records
                </Link>
              </Button>
            ) : null}
            {canManageAnnouncements ? (
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-start font-medium"
              >
                <Link to={ROUTES.announcements}>
                  <BellRing /> Post announcement
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full justify-start font-medium"
              onClick={openAiAssistant}
            >
              <MessageCircleMore /> Open ALAGA AI
            </Button>
          </CardContent>
        </Card>

        {staffView ? (
          <Card>
            <CardHeader>
              <SectionHeading
                title="Appointment calendar"
                description="Review the authorized monthly schedule"
              />
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to={ROUTES.appointmentCalendar}>Open calendar</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </section>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Megaphone className="h-4 w-4" />
        Only verified, permission-filtered information is displayed.
      </div>
    </div>
  );
}
