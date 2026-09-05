import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppointmentStartTimeSelect } from "@/features/appointments/AppointmentStartTimeSelect";
import {
  ACTION_LABELS,
  ACTION_TARGET_STATUS,
  APPOINTMENT_ACTIONS,
} from "@/features/appointments/constants";
import { useAppointmentMutation } from "@/features/appointments/hooks";
import { transitionDescription } from "@/features/appointments/permissions";
import {
  cancellationSchema,
  rejectionSchema,
  rescheduleSchema,
} from "@/features/appointments/schemas";
import {
  addDaysToDateKey,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import { USER_ROLES } from "@/features/auth/permissions";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { appointmentService } from "@/services/appointmentService";

const transitionSchema = z.object({});

function schemaFor(action, residentRequestRejection) {
  if (action === APPOINTMENT_ACTIONS.CANCEL) {
    return residentRequestRejection ? rejectionSchema : cancellationSchema;
  }
  if (action === APPOINTMENT_ACTIONS.RESCHEDULE) return rescheduleSchema;
  return transitionSchema;
}

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export function AppointmentActionDialog({
  open,
  onOpenChange,
  action,
  appointment,
  onSuccess,
}) {
  const { profile } = useAuth();
  const residentSelfCancellation =
    action === APPOINTMENT_ACTIONS.CANCEL &&
    profile.role === USER_ROLES.RESIDENT;
  const residentRequestRejection =
    action === APPOINTMENT_ACTIONS.CANCEL &&
    profile.role !== USER_ROLES.RESIDENT &&
    appointment?.request_source === "resident" &&
    appointment?.status === "pending";
  const actionLabel = residentRequestRejection
    ? "Reject request"
    : ACTION_LABELS[action];
  const requestKey = useRef(crypto.randomUUID());
  const mutation = useAppointmentMutation(async (values) => {
    if (residentSelfCancellation) {
      return appointmentService.cancelResidentAppointment(
        appointment,
        values.cancellation_reason,
      );
    }
    if (action === APPOINTMENT_ACTIONS.RESCHEDULE) {
      return appointmentService.reschedule(
        appointment,
        values,
        requestKey.current,
      );
    }
    if (action === APPOINTMENT_ACTIONS.ARCHIVE) {
      return appointmentService.setArchived(appointment, true);
    }
    if (action === APPOINTMENT_ACTIONS.RESTORE) {
      return appointmentService.setArchived(appointment, false);
    }
    return appointmentService.transition(
      appointment,
      ACTION_TARGET_STATUS[action],
      residentRequestRejection
        ? { cancellation_reason: values.rejection_reason }
        : values,
    );
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schemaFor(action, residentRequestRejection)),
    defaultValues: {},
  });

  useDialogDraftLifecycle({
    open,
    draftKey: `${appointment?.id ?? "none"}:${action ?? "none"}`,
    resetDraft: () => {
      if (!appointment) return;
      requestKey.current = crypto.randomUUID();
      mutation.reset();
      reset({
        cancellation_reason: "",
        rejection_reason: "",
        scheduled_date: addDaysToDateKey(manilaDateKey(), 1),
        start_time: appointment.start_time?.slice(0, 5) ?? "08:00",
        end_time: appointment.end_time?.slice(0, 5) ?? "08:30",
      });
    },
  });

  if (!appointment || !action) return null;

  async function submit(values) {
    const result = await mutation.mutateAsync(values);
    toast.success(
      action === APPOINTMENT_ACTIONS.RESCHEDULE
        ? "Appointment rescheduled"
        : `${ACTION_LABELS[action]} completed`,
      {
        description:
          action === APPOINTMENT_ACTIONS.RESCHEDULE
            ? result.replacement_number
            : appointment.appointment_number,
      },
    );
    onOpenChange(false);
    onSuccess?.(result);
  }

  const destructive = [
    APPOINTMENT_ACTIONS.CANCEL,
    APPOINTMENT_ACTIONS.ARCHIVE,
  ].includes(action);

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{actionLabel}</DialogTitle>
          <DialogDescription>
            {action === APPOINTMENT_ACTIONS.RESCHEDULE
              ? "The current appointment schedule will be updated atomically. The Resident's original preferred schedule remains recorded."
              : residentRequestRejection
                ? "Rejecting a Resident request requires a brief justification for accountability."
                : action === APPOINTMENT_ACTIONS.CANCEL
                  ? "Cancellation keeps the appointment and its audit history."
                  : transitionDescription(action, appointment)}
          </DialogDescription>
        </DialogHeader>
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <form className="space-y-4" onSubmit={handleSubmit(submit)}>
          <div className="rounded-lg border bg-muted/25 p-3 text-sm font-medium">
            {appointment.appointment_number}
          </div>

          {action === APPOINTMENT_ACTIONS.CANCEL ? (
            <div className="space-y-2">
              <Label htmlFor="appointment-cancellation-reason">
                {residentRequestRejection
                  ? "Rejection reason"
                  : "Cancellation reason (optional)"}
              </Label>
              <textarea
                id="appointment-cancellation-reason"
                rows={4}
                {...register(
                  residentRequestRejection
                    ? "rejection_reason"
                    : "cancellation_reason",
                )}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <FieldError
                error={
                  residentRequestRejection
                    ? errors.rejection_reason
                    : errors.cancellation_reason
                }
              />
            </div>
          ) : null}

          {action === APPOINTMENT_ACTIONS.RESCHEDULE ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="reschedule-date">New date</Label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    {...register("scheduled_date")}
                  />
                  <FieldError error={errors.scheduled_date} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reschedule-start">Start</Label>
                  <AppointmentStartTimeSelect
                    id="reschedule-start"
                    {...register("start_time")}
                  />
                  <p className="text-xs text-muted-foreground">
                    8:00 AM–4:00 PM, Asia/Manila.
                  </p>
                  <FieldError error={errors.start_time} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reschedule-end">End</Label>
                  <Input
                    id="reschedule-end"
                    type="time"
                    {...register("end_time")}
                  />
                  <FieldError error={errors.end_time} />
                </div>
              </div>
            </>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Back
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              {mutation.isPending ? "Saving…" : actionLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
