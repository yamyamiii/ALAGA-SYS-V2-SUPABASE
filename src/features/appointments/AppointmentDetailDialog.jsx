import { CalendarClock, Pencil } from "lucide-react";
import { useState } from "react";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ACTION_LABELS,
  APPOINTMENT_ACTIONS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  PRIORITY_LABELS,
} from "@/features/appointments/constants";
import { AppointmentActionDialog } from "@/features/appointments/AppointmentActionDialog";
import { useAppointment } from "@/features/appointments/hooks";
import { getAppointmentActions } from "@/features/appointments/permissions";
import {
  formatManilaDate,
  formatManilaTime,
  formatManilaTimestamp,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import { AppointmentEncounterAction } from "@/features/health-records/AppointmentEncounterAction";
import { formatPersonName } from "@/features/registry/formatters";

function Value({ label, children, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm font-medium">
        {children || "Not provided"}
      </dd>
    </div>
  );
}

export function AppointmentDetailDialog({
  appointmentId,
  open,
  onOpenChange,
  onEdit,
}) {
  const { profile } = useAuth();
  const query = useAppointment(appointmentId, open);
  const [action, setAction] = useState(null);
  const appointment = query.data;
  const actions = getAppointmentActions(profile.role, appointment, profile.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Appointment details</DialogTitle>
            <DialogDescription>
              Operational scheduling details shown according to your account
              permissions.
            </DialogDescription>
          </DialogHeader>
          {query.isLoading ? (
            <LoadingState
              compact
              title="Loading appointment"
              description="Retrieving the authorized appointment record…"
            />
          ) : query.isError ? (
            <ErrorState
              compact
              title={
                query.error.code === "appointment_not_found"
                  ? "Appointment not found"
                  : "Appointment unavailable"
              }
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : appointment ? (
            <div className="space-y-5">
              <section className="rounded-xl border bg-primary/5 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-xl font-semibold">
                      {appointment.appointment_number}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatManilaDate(appointment.scheduled_date)} ·{" "}
                      {formatManilaTime(appointment.start_time)}–
                      {formatManilaTime(appointment.end_time)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={
                        appointment.priority === "urgent"
                          ? "destructive"
                          : appointment.priority === "priority"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {PRIORITY_LABELS[appointment.priority]}
                    </Badge>
                    <StatusBadge
                      status={APPOINTMENT_STATUS_LABELS[appointment.status]}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-xl border p-4">
                <h3 className="font-heading font-semibold">Health Record</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clinical documentation remains separate from operational
                  appointment notes.
                </p>
                <div className="mt-4">
                  <AppointmentEncounterAction appointment={appointment} />
                </div>
              </section>

              <section className="rounded-xl border p-4">
                <h3 className="font-heading font-semibold">Schedule</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Value label="Resident">
                    {formatPersonName(appointment.resident)}
                  </Value>
                  <Value label="Resident number">
                    {appointment.resident?.resident_number}
                  </Value>
                  <Value label="Purok">
                    {appointment.resident?.purok?.name}
                  </Value>
                  <Value label="Type">
                    {APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}
                  </Value>
                  <Value label="Service">{appointment.service_type}</Value>
                  <Value label="Assigned staff">
                    {formatPersonName(appointment.staff)}
                  </Value>
                  <Value label="Reason" wide>
                    {appointment.reason}
                  </Value>
                  <Value label="Operational notes" wide>
                    {appointment.operational_notes}
                  </Value>
                  {appointment.cancellation_reason ? (
                    <Value label="Cancellation reason" wide>
                      {appointment.cancellation_reason}
                    </Value>
                  ) : null}
                  {appointment.rescheduled_from ? (
                    <Value label="Rescheduled from">
                      {appointment.rescheduled_from.appointment_number}
                    </Value>
                  ) : null}
                </dl>
              </section>

              <section className="rounded-xl border p-4">
                <h3 className="font-heading font-semibold">
                  Operational timeline
                </h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Value label="Checked in">
                    {formatManilaTimestamp(appointment.checked_in_at)}
                  </Value>
                  <Value label="Started">
                    {formatManilaTimestamp(appointment.started_at)}
                  </Value>
                  <Value label="Completed">
                    {formatManilaTimestamp(appointment.completed_at)}
                  </Value>
                  <Value label="Cancelled">
                    {formatManilaTimestamp(appointment.cancelled_at)}
                  </Value>
                  <Value label="Created">
                    {formatManilaTimestamp(appointment.created_at)}
                  </Value>
                  <Value label="Last updated">
                    {formatManilaTimestamp(appointment.updated_at)}
                  </Value>
                </dl>
              </section>

              {actions.length ? (
                <div className="flex flex-wrap gap-2 border-t pt-5">
                  {actions.map((availableAction) => (
                    <Button
                      key={availableAction}
                      type="button"
                      variant={
                        [
                          APPOINTMENT_ACTIONS.CANCEL,
                          APPOINTMENT_ACTIONS.ARCHIVE,
                        ].includes(availableAction)
                          ? "destructive"
                          : "outline"
                      }
                      onClick={() =>
                        availableAction === APPOINTMENT_ACTIONS.EDIT
                          ? onEdit?.(appointment)
                          : setAction(availableAction)
                      }
                    >
                      {availableAction === APPOINTMENT_ACTIONS.EDIT ? (
                        <Pencil />
                      ) : (
                        <CalendarClock />
                      )}
                      {ACTION_LABELS[availableAction]}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AppointmentActionDialog
        open={Boolean(action)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setAction(null);
        }}
        action={action}
        appointment={appointment}
        onSuccess={() => query.refetch()}
      />
    </>
  );
}
