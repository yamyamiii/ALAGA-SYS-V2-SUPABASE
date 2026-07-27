import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
  APPOINTMENT_PRIORITIES,
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPES,
  PRIORITY_LABELS,
  SERVICE_TYPES,
} from "@/features/appointments/constants";
import { AppointmentResidentField } from "@/features/appointments/AppointmentResidentField";
import { AppointmentStaffField } from "@/features/appointments/AppointmentStaffField";
import { useAppointmentMutation } from "@/features/appointments/hooks";
import { appointmentSchema } from "@/features/appointments/schemas";
import {
  addDaysToDateKey,
  addMinutesToTime,
  manilaDateKey,
  manilaTimeKey,
} from "@/features/appointments/timezone";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { appointmentService } from "@/services/appointmentService";

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

function defaults(walkIn = false) {
  const now = new Date();
  const currentTime = manilaTimeKey(now);
  return {
    resident_id: "",
    appointment_type: walkIn ? "walk_in" : "scheduled",
    service_type: "General Consultation",
    scheduled_date: walkIn
      ? manilaDateKey(now)
      : addDaysToDateKey(manilaDateKey(now), 1),
    start_time: walkIn ? currentTime : "08:00",
    end_time: walkIn ? addMinutesToTime(currentTime, 30) : "08:30",
    priority: "normal",
    assigned_staff_id: "",
    reason: "",
    operational_notes: "",
  };
}

export function AppointmentFormDialog({
  open,
  onOpenChange,
  appointment,
  walkIn = false,
  onSaved,
}) {
  const editing = Boolean(appointment);
  const [selectedResident, setSelectedResident] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const requestKey = useRef(crypto.randomUUID());
  const mutation = useAppointmentMutation((values) =>
    editing
      ? appointmentService.updateAppointment(appointment, values)
      : appointmentService.createAppointment(values, requestKey.current),
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(appointmentSchema),
    defaultValues: defaults(walkIn),
  });
  const serviceType = watch("service_type");

  useDialogDraftLifecycle({
    open,
    draftKey: `${appointment?.id ?? "new"}:${walkIn ? "walk-in" : "scheduled"}`,
    resetDraft: () => {
      requestKey.current = crypto.randomUUID();
      mutation.reset();
      if (appointment) {
        reset({
          resident_id: appointment.resident_id,
          appointment_type: appointment.appointment_type,
          service_type: appointment.service_type,
          scheduled_date: appointment.scheduled_date,
          start_time: appointment.start_time?.slice(0, 5),
          end_time: appointment.end_time?.slice(0, 5),
          priority: appointment.priority,
          assigned_staff_id: appointment.assigned_staff_id ?? "",
          reason: appointment.reason ?? "",
          operational_notes: appointment.operational_notes ?? "",
        });
        setSelectedResident(appointment.resident);
        setSelectedStaff(appointment.staff);
      } else {
        reset(defaults(walkIn));
        setSelectedResident(null);
        setSelectedStaff(null);
      }
    },
  });

  function selectResident(resident) {
    setSelectedResident(resident);
    setValue("resident_id", resident?.id ?? "", { shouldValidate: true });
  }

  function selectStaff(staff) {
    setSelectedStaff(staff);
    setValue("assigned_staff_id", staff?.id ?? "", { shouldValidate: true });
  }

  async function submit(values) {
    const result = await mutation.mutateAsync(values);
    toast.success(
      editing
        ? "Appointment updated"
        : walkIn
          ? "Walk-in registered"
          : "Appointment created",
      {
        description: result.appointment_number,
      },
    );
    onOpenChange(false);
    onSaved?.(result);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Edit appointment"
              : walkIn
                ? "Register walk-in"
                : "Create appointment"}
          </DialogTitle>
          <DialogDescription>
            Times are interpreted in Asia/Manila. Appointment numbers are
            generated by the database.
          </DialogDescription>
        </DialogHeader>
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <form className="space-y-5" onSubmit={handleSubmit(submit)}>
          <div className="space-y-2">
            <Label>Resident</Label>
            <AppointmentResidentField
              value={watch("resident_id")}
              selected={selectedResident}
              onChange={selectResident}
              disabled={editing || mutation.isPending}
            />
            <FieldError error={errors.resident_id} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appointment-type">Appointment type</Label>
              <select
                id="appointment-type"
                {...register("appointment_type")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {APPOINTMENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {APPOINTMENT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
              <FieldError error={errors.appointment_type} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-service">Service</Label>
              <select
                id="appointment-service"
                {...register("service_type")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SERVICE_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <FieldError error={errors.service_type} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-date">Date</Label>
              <Input
                id="appointment-date"
                type="date"
                {...register("scheduled_date")}
              />
              <FieldError error={errors.scheduled_date} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-priority">Operational priority</Label>
              <select
                id="appointment-priority"
                {...register("priority")}
                className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {APPOINTMENT_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Priority is for queue operations only and is not medical triage.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-start">Start time</Label>
              <Input
                id="appointment-start"
                type="time"
                {...register("start_time")}
              />
              <FieldError error={errors.start_time} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-end">End time</Label>
              <Input
                id="appointment-end"
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
              serviceType={serviceType}
              onChange={selectStaff}
              disabled={mutation.isPending}
            />
            <FieldError error={errors.assigned_staff_id} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appointment-reason">Reason</Label>
            <textarea
              id="appointment-reason"
              rows={3}
              {...register("reason")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <FieldError error={errors.reason} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appointment-notes">
              Operational notes (optional)
            </Label>
            <textarea
              id="appointment-notes"
              rows={3}
              {...register("operational_notes")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              Do not enter diagnoses, prescriptions, or clinical encounter
              notes.
            </p>
            <FieldError error={errors.operational_notes} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CalendarPlus />
              )}
              {mutation.isPending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : walkIn
                    ? "Register walk-in"
                    : "Create appointment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
