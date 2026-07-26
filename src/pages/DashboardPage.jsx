import { format } from "date-fns";
import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CircleCheckBig,
  ClipboardPlus,
  Megaphone,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { SectionHeading } from "@/components/common/SectionHeading";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ROUTES } from "@/config/routes";
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
import { hasPermission, PERMISSIONS } from "@/features/auth/permissions";

const unavailableActions = [
  { label: "New resident", icon: UsersRound },
  { label: "Post announcement", icon: BellRing },
];

export default function DashboardPage() {
  const { profile } = useAuth();
  const today = manilaDateKey();
  const summary = useAppointmentDashboard();
  const queue = useAppointmentQueue(
    { date: today, page: 1, pageSize: 5 },
    { poll: false },
  );
  const canSchedule = hasPermission(
    profile.role,
    PERMISSIONS.SCHEDULE_APPOINTMENTS,
  );
  const appointmentStats = [
    {
      label: "Today's appointments",
      icon: CalendarCheck,
      value: summary.data?.appointments_today,
      helper: "Visible to your account",
    },
    {
      label: "Pending appointments",
      icon: CalendarClock,
      value: summary.data?.pending_appointments,
      helper: "Awaiting confirmation",
    },
    {
      label: "Checked in today",
      icon: UsersRound,
      value: summary.data?.checked_in_today,
      helper: "Current operational queue",
    },
    {
      label: "Completed today",
      icon: CircleCheckBig,
      value: summary.data?.completed_today,
      helper: `${summary.data?.upcoming_appointments ?? 0} upcoming`,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Operations overview"
        title="Good day, Barangay Health Team"
        description="Appointment totals and queue entries reflect only records authorized for your account."
        actions={
          <div className="rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground shadow-sm">
            <span className="font-medium text-foreground">
              {format(new Date(), "EEEE")}
            </span>
            <span className="mx-2 text-border">•</span>
            {format(new Date(), "MMMM d, yyyy")}
          </div>
        }
      />

      <section
        aria-label="Appointment statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {appointmentStats.map((stat) => (
          <StatCard key={stat.label} {...stat} loading={summary.isLoading} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <SectionHeading
              title="Appointment operations"
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
                      {summary.isLoading ? "…" : (stat.value ?? 0)}
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
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/40"
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
                        item.priority === "urgent" ? "destructive" : "secondary"
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

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionHeading
              title="Quick actions"
              description="Available actions follow your role permissions"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {canSchedule ? (
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-start font-medium"
              >
                <Link to={ROUTES.appointments}>
                  <CalendarCheck />
                  Schedule appointment
                </Link>
              </Button>
            ) : null}
            {unavailableActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.label}
                  type="button"
                  variant="outline"
                  className="h-12 w-full justify-start font-medium"
                  disabled
                >
                  <Icon />
                  {action.label}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    Unavailable
                  </span>
                </Button>
              );
            })}
            <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-xs leading-5 text-secondary-foreground">
              <ClipboardPlus className="mt-0.5 h-4 w-4 shrink-0" />
              Unfinished modules remain disabled and do not display fabricated
              data.
            </div>
          </CardContent>
        </Card>

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
      </section>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Megaphone className="h-4 w-4" />
        Only verified, permission-filtered information is displayed.
      </div>
    </div>
  );
}
