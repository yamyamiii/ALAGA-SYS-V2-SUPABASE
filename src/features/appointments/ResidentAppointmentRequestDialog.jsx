import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, LoaderCircle } from "lucide-react";
import { useEffect, useRef } from "react";
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
import { SERVICE_TYPES } from "@/features/appointments/constants";
import { useAppointmentMutation } from "@/features/appointments/hooks";
import { residentAppointmentRequestSchema } from "@/features/appointments/schemas";
import {
  addDaysToDateKey,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { appointmentService } from "@/services/appointmentService";

function defaults() {
  return {
    service_type: "General Consultation",
    scheduled_date: addDaysToDateKey(manilaDateKey(), 1),
    start_time: "08:00",
    end_time: "08:30",
    reason: "",
  };
}

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export function ResidentAppointmentRequestDialog({
  open,
  onOpenChange,
  onSaved,
}) {
  const requestKey = useRef(crypto.randomUUID());
  const mutation = useAppointmentMutation((values) =>
    appointmentService.requestResidentAppointment(values, requestKey.current),
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(residentAppointmentRequestSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (!open) return;
    requestKey.current = crypto.randomUUID();
    mutation.reset();
    reset(defaults());
  }, [open, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(values) {
    const result = await mutation.mutateAsync(values);
    toast.success("Appointment request submitted", {
      description: `${result.appointment_number} is awaiting health-center confirmation.`,
    });
    onOpenChange(false);
    onSaved?.(result);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request appointment</DialogTitle>
          <DialogDescription>
            Choose your preferred schedule in Asia/Manila. This is a request,
            not a confirmed slot. Health-center staff will review the schedule
            and assign an eligible staff member.
          </DialogDescription>
        </DialogHeader>

        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit(submit)}>
          <div className="space-y-2">
            <Label htmlFor="resident-request-service">Service</Label>
            <select
              id="resident-request-service"
              {...register("service_type")}
              disabled={mutation.isPending}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {SERVICE_TYPES.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
            <FieldError error={errors.service_type} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="resident-request-date">Preferred date</Label>
              <Input
                id="resident-request-date"
                type="date"
                min={manilaDateKey()}
                disabled={mutation.isPending}
                {...register("scheduled_date")}
              />
              <FieldError error={errors.scheduled_date} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resident-request-start">
                Preferred start time
              </Label>
              <Input
                id="resident-request-start"
                type="time"
                disabled={mutation.isPending}
                {...register("start_time")}
              />
              <FieldError error={errors.start_time} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resident-request-end">Preferred end time</Label>
              <Input
                id="resident-request-end"
                type="time"
                disabled={mutation.isPending}
                {...register("end_time")}
              />
              <FieldError error={errors.end_time} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resident-request-reason">Reason for visit</Label>
            <textarea
              id="resident-request-reason"
              rows={4}
              disabled={mutation.isPending}
              {...register("reason")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              Share only what the health center needs to route your request.
              This text is excluded from broad lists, calendars, queues, audit
              logs, and diagnostics.
            </p>
            <FieldError error={errors.reason} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Back
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CalendarPlus />
              )}
              {mutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
