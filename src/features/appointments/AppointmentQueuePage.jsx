import { Eye, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState } from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ACTION_LABELS,
  ACTION_TARGET_STATUS,
  APPOINTMENT_ACTIONS,
  APPOINTMENT_PRIORITIES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/features/appointments/constants";
import { AppointmentDetailDialog } from "@/features/appointments/AppointmentDetailDialog";
import { AppointmentTabs } from "@/features/appointments/AppointmentTabs";
import {
  useAppointmentMutation,
  useAppointmentQueue,
} from "@/features/appointments/hooks";
import { getAppointmentActions } from "@/features/appointments/permissions";
import {
  formatManilaDate,
  formatManilaTime,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import { RegistrySkeleton } from "@/features/registry/RegistrySkeleton";
import { appointmentService } from "@/services/appointmentService";

const QUICK_ACTIONS = [
  APPOINTMENT_ACTIONS.CONFIRM,
  APPOINTMENT_ACTIONS.CHECK_IN,
  APPOINTMENT_ACTIONS.COMPLETE,
  APPOINTMENT_ACTIONS.NO_SHOW,
];

function PriorityBadge({ value }) {
  return (
    <Badge
      variant={
        value === "urgent"
          ? "destructive"
          : value === "priority"
            ? "warning"
            : "secondary"
      }
    >
      {PRIORITY_LABELS[value]}
    </Badge>
  );
}

export default function AppointmentQueuePage() {
  const { profile } = useAuth();
  const [filters, setFilters] = useState({
    date: manilaDateKey(),
    status: "",
    priority: "",
  });
  const [detailId, setDetailId] = useState(null);
  const query = useAppointmentQueue(
    { ...filters, page: 1, pageSize: 100 },
    { poll: true },
  );
  const mutation = useAppointmentMutation(({ appointment, action }) =>
    appointmentService.transition(appointment, ACTION_TARGET_STATUS[action]),
  );
  const items = query.data?.items ?? [];

  async function runAction(appointment, action) {
    try {
      await mutation.mutateAsync({ appointment, action });
      toast.success(`${ACTION_LABELS[action]} completed`, {
        description: appointment.appointment_number,
      });
    } catch (error) {
      toast.error("Appointment action failed", {
        description: error.message,
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Daily operations"
        title="Daily appointment queue"
        description="Operational order only. This queue is not a clinical triage assessment."
        actions={
          <div className="flex max-w-full flex-wrap items-center gap-2">
            <time
              dateTime={filters.date}
              className="rounded-lg border bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
            >
              {formatManilaDate(filters.date)}
            </time>
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
            >
              <RefreshCw className={query.isFetching ? "animate-spin" : ""} />
              Refresh
            </Button>
          </div>
        }
      />
      <AppointmentTabs />

      <Card>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="date"
              value={filters.date}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
              aria-label="Queue date"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              aria-label="Filter queue status"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              {APPOINTMENT_STATUSES.filter(
                (status) => status !== "rescheduled",
              ).map((status) => (
                <option key={status} value={status}>
                  {APPOINTMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <select
              value={filters.priority}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  priority: event.target.value,
                }))
              }
              aria-label="Filter queue priority"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All priorities</option>
              {APPOINTMENT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority]}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            Checked-in residents appear first, then urgent and priority
            appointments, followed by check-in and scheduled time.
          </div>

          {query.isLoading ? (
            <RegistrySkeleton />
          ) : query.isError ? (
            <ErrorState
              title="Daily queue could not be loaded"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="The queue is empty"
              description="No visible appointments match this date and filter."
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Position</th>
                      <th className="px-3 py-3">Resident</th>
                      <th className="px-3 py-3">Appointment</th>
                      <th className="px-3 py-3">Service</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Assigned staff</th>
                      <th className="px-3 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => {
                      const actions = getAppointmentActions(
                        profile.role,
                        item,
                        profile.id,
                      ).filter((action) => QUICK_ACTIONS.includes(action));
                      return (
                        <tr key={item.id} className="hover:bg-muted/35">
                          <td className="px-3 py-4 text-lg font-semibold">
                            {item.queue_position}
                          </td>
                          <td className="px-3 py-4">
                            <p className="font-medium">{item.resident_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.resident_number}
                            </p>
                          </td>
                          <td className="px-3 py-4">
                            <p>{item.appointment_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatManilaTime(item.start_time)}
                            </p>
                          </td>
                          <td className="px-3 py-4">{item.service_type}</td>
                          <td className="px-3 py-4">
                            <PriorityBadge value={item.priority} />
                          </td>
                          <td className="px-3 py-4">
                            <StatusBadge
                              status={APPOINTMENT_STATUS_LABELS[item.status]}
                            />
                          </td>
                          <td className="px-3 py-4">
                            {item.staff_name || "Unassigned"}
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-wrap gap-2">
                              {actions.slice(0, 1).map((action) => (
                                <Button
                                  key={action}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={mutation.isPending}
                                  onClick={() => runAction(item, action)}
                                >
                                  {mutation.isPending ? (
                                    <LoaderCircle className="animate-spin" />
                                  ) : null}
                                  {ACTION_LABELS[action]}
                                </Button>
                              ))}
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`View ${item.appointment_number}`}
                                onClick={() => setDetailId(item.id)}
                              >
                                <Eye />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 lg:hidden">
                {items.map((item) => {
                  const actions = getAppointmentActions(
                    profile.role,
                    item,
                    profile.id,
                  ).filter((action) => QUICK_ACTIONS.includes(action));
                  return (
                    <article key={item.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Queue #{item.queue_position}
                          </p>
                          <p className="mt-1 font-semibold">
                            {item.resident_name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.appointment_number} ·{" "}
                            {formatManilaTime(item.start_time)}
                          </p>
                        </div>
                        <StatusBadge
                          status={APPOINTMENT_STATUS_LABELS[item.status]}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <PriorityBadge value={item.priority} />
                        <Badge variant="outline">{item.service_type}</Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {actions.slice(0, 1).map((action) => (
                          <Button
                            key={action}
                            type="button"
                            size="sm"
                            disabled={mutation.isPending}
                            onClick={() => runAction(item, action)}
                          >
                            {ACTION_LABELS[action]}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailId(item.id)}
                        >
                          <Eye /> View
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AppointmentDetailDialog
        appointmentId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      />
    </div>
  );
}
