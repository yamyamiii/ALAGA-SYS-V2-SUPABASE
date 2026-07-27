import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import {
  ACTION_LABELS,
  ACTION_TARGET_STATUS,
  APPOINTMENT_ACTIONS,
} from "@/features/appointments/constants";
import { AppointmentStaffField } from "@/features/appointments/AppointmentStaffField";
import { useAppointmentMutation } from "@/features/appointments/hooks";
import { transitionDescription } from "@/features/appointments/permissions";
import {
  cancellationSchema,
  operationalNotesSchema,
  rescheduleSchema,
} from "@/features/appointments/schemas";
import {
  addDaysToDateKey,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import { USER_ROLES } from "@/features/auth/permissions";
import { appointmentService } from "@/services/appointmentService";

const transitionSchema = z.object({});

function schemaFor(action) {
  if (action === APPOINTMENT_ACTIONS.CANCEL) return cancellationSchema;
  if (action === APPOINTMENT_ACTIONS.RESCHEDULE) return rescheduleSchema;
  if (action === APPOINTMENT_ACTIONS.NOTES) return operationalNotesSchema;
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
  const [selectedStaff, setSelectedStaff] = useState(null);
  const requestKey = useRef(crypto.randomUUID());
  const mutation = useAppointmentMutation(async (values) => {
    if (
      action === APPOINTMENT_ACTIONS.CANCEL &&
      profile.role === USER_ROLES.RESIDENT
    ) {
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
    if (action === APPOINTMENT_ACTIONS.NOTES) {
      return appointmentService.updateOperationalNotes(
        appointment,
        values.operational_notes,
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
      values,
    );
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schemaFor(action)), defaultValues: {} });

  useEffect(() => {
    if (!open || !appointment) return;
    requestKey.current = crypto.randomUUID();
    mutation.reset();
    setSelectedStaff(appointment.staff ?? null);
    reset({
      cancellation_reason: "",
      operational_notes: appointment.operational_notes ?? "",
      scheduled_date: addDaysToDateKey(manilaDateKey(), 1),
      start_time: appointment.start_time?.slice(0, 5) ?? "08:00",
      end_time: appointment.end_time?.slice(0, 5) ?? "08:30",
      assigned_staff_id: appointment.assigned_staff_id ?? "",
    });
  }, [open, appointment, action, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!appointment || !action) return null;

  function selectStaff(staff) {
    setSelectedStaff(staff);
    setValue("assigned_staff_id", staff?.id ?? "", { shouldValidate: true });
  }

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
          <DialogTitle>{ACTION_LABELS[action]}</DialogTitle>
          <DialogDescription>
            {action === APPOINTMENT_ACTIONS.RESCHEDULE
              ? "The original appointment will remain in history as rescheduled, and a linked replacement will be created atomically."
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
                Cancellation reason
              </Label>
              <textarea
                id="appointment-cancellation-reason"
                rows={4}
                {...register("cancellation_reason")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <FieldError error={errors.cancellation_reason} />
            </div>
          ) : null}

          {action === APPOINTMENT_ACTIONS.NOTES ? (
            <div className="space-y-2">
              <Label htmlFor="appointment-operational-notes">
                Operational notes
              </Label>
              <textarea
                id="appointment-operational-notes"
                rows={5}
                {...register("operational_notes")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">
                Do not enter diagnoses, prescriptions, or clinical encounter
                notes.
              </p>
              <FieldError error={errors.operational_notes} />
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
                  <Input
                    id="reschedule-start"
                    type="time"
                    {...register("start_time")}
                  />
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
              <div className="space-y-2">
                <Label>Assigned staff (optional)</Label>
                <AppointmentStaffField
                  value={watch("assigned_staff_id")}
                  selected={selectedStaff}
                  serviceType={appointment.service_type}
                  onChange={selectStaff}
                  disabled={mutation.isPending}
                />
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
              {mutation.isPending ? "Saving…" : ACTION_LABELS[action]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
