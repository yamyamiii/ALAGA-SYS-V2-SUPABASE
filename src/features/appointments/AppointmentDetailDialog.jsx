import { CalendarClock, FileText, Pencil } from "lucide-react";
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
import { USER_ROLES } from "@/features/auth/permissions";
import { DocumentPreviewDialog } from "@/features/documents/DocumentPreviewDialog";
import { DOCUMENT_TYPES } from "@/features/documents/constants";
import { canPrintAppointmentSlip } from "@/features/documents/permissions";
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

function preferredScheduleWasAdjusted(appointment) {
  if (appointment?.request_source !== "resident") return false;
  return (
    appointment.scheduled_date !== appointment.requested_date ||
    appointment.start_time?.slice(0, 5) !==
      appointment.requested_start_time?.slice(0, 5) ||
    appointment.end_time?.slice(0, 5) !==
      appointment.requested_end_time?.slice(0, 5)
  );
}

export function AppointmentDetailDialog({
  appointmentId,
  open,
  onOpenChange,
  onEdit,
}) {
  const { profile } = useAuth();
  const residentView = profile.role === USER_ROLES.RESIDENT;
  const query = useAppointment(appointmentId, open, {
    resident: residentView,
  });
  const [action, setAction] = useState(null);
  const [printOpen, setPrintOpen] = useState(false);
  const appointment = query.data;
  const actions = getAppointmentActions(profile.role, appointment, profile.id);
  const printable = canPrintAppointmentSlip(
    profile.role,
    appointment,
    profile.id,
  );
  const preferredScheduleAdjusted = preferredScheduleWasAdjusted(appointment);

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
              <section
                className="rounded-xl border border-primary/20 bg-primary/5 p-4"
                aria-labelledby="current-appointment-heading"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3
                      id="current-appointment-heading"
                      className="font-heading font-semibold"
                    >
                      Current appointment
                    </h3>
                    <p className="font-heading text-xl font-semibold">
                      {appointment.appointment_number}
                    </p>
                  </div>
                  {!residentView ? (
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
                  ) : null}
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Value label="Status">
                    <StatusBadge
                      status={APPOINTMENT_STATUS_LABELS[appointment.status]}
                    />
                  </Value>
                  <Value label="Schedule">
                    {formatManilaDate(appointment.scheduled_date)}
                  </Value>
                  <Value label="Time">
                    {formatManilaTime(appointment.start_time)}–
                    {formatManilaTime(appointment.end_time)}
                  </Value>
                  <Value label="Service">{appointment.service_type}</Value>
                  <Value label="Assigned staff" wide>
                    {formatPersonName(appointment.staff)}
                  </Value>
                </dl>
              </section>

              <section className="rounded-xl border p-4">
                <h3 className="font-heading font-semibold">
                  Appointment information
                </h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {!residentView ? (
                    <>
                      <Value label="Resident">
                        {formatPersonName(appointment.resident)}
                      </Value>
                      <Value label="Resident number">
                        {appointment.resident?.resident_number}
                      </Value>
                      <Value label="Purok">
                        {appointment.resident?.purok?.name}
                      </Value>
                    </>
                  ) : null}
                  <Value label="Type">
                    {APPOINTMENT_TYPE_LABELS[appointment.appointment_type]}
                  </Value>
                  <Value label="Reason" wide>
                    {appointment.reason}
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

              {appointment.request_source === "resident" ? (
                <section className="rounded-xl border p-4">
                  <h3 className="font-heading font-semibold">
                    Original appointment request
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {residentView
                      ? "This is the schedule you originally requested. The health center may adjust the final appointment schedule."
                      : "This is the schedule the Resident originally requested. The health center may adjust the final appointment schedule."}
                  </p>
                  {preferredScheduleAdjusted ? (
                    <p className="mt-2 text-sm font-medium text-primary">
                      {residentView
                        ? "The health center adjusted your preferred schedule. Your current appointment schedule is shown above."
                        : "The current appointment schedule differs from the Resident's preferred schedule shown below."}
                    </p>
                  ) : null}
                  <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Value label="Preferred date">
                      {formatManilaDate(appointment.requested_date)}
                    </Value>
                    <Value label="Preferred start">
                      {formatManilaTime(appointment.requested_start_time)}
                    </Value>
                    <Value label="Preferred end">
                      {formatManilaTime(appointment.requested_end_time)}
                    </Value>
                    <Value label="Requested">
                      {formatManilaTimestamp(appointment.resident_requested_at)}
                    </Value>
                  </dl>
                </section>
              ) : null}

              <section className="rounded-xl border p-4">
                <h3 className="font-heading font-semibold">
                  Operational timeline
                </h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {!residentView ? (
                    <>
                      <Value label="Checked in">
                        {formatManilaTimestamp(appointment.checked_in_at)}
                      </Value>
                      <Value label="Started">
                        {formatManilaTimestamp(appointment.started_at)}
                      </Value>
                      <Value label="Completed">
                        {formatManilaTimestamp(appointment.completed_at)}
                      </Value>
                    </>
                  ) : null}
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

              {actions.length || printable ? (
                <div className="flex flex-wrap gap-2 border-t pt-5">
                  {printable ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPrintOpen(true)}
                    >
                      <FileText /> Print Appointment Slip
                    </Button>
                  ) : null}
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
      {printOpen ? (
        <DocumentPreviewDialog
          documentType={DOCUMENT_TYPES.APPOINTMENT_SLIP}
          recordId={appointmentId}
          open
          onOpenChange={setPrintOpen}
        />
      ) : null}
    </>
  );
}
