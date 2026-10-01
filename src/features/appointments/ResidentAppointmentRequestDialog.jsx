import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, CheckCircle2, LoaderCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  useAppointmentMutation,
  useResidentAppointmentAvailability,
  useResidentBookingServices,
} from "@/features/appointments/hooks";
import { residentAppointmentRequestSchema } from "@/features/appointments/schemas";
import {
  addDaysToDateKey,
  formatManilaDate,
  formatManilaTime,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { appointmentService } from "@/services/appointmentService";

const AVAILABILITY_RANGE_DAYS = 60;
const EMPTY_SLOTS = Object.freeze([]);

function defaults() {
  return {
    service_type: "General Consultation",
    scheduled_date: "",
    start_time: "",
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
  const [confirmedAppointment, setConfirmedAppointment] = useState(null);
  const mutation = useAppointmentMutation((values) =>
    appointmentService.requestResidentAppointment(values, requestKey.current),
  );
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(residentAppointmentRequestSchema),
    defaultValues: defaults(),
  });

  const serviceType = watch("service_type");
  const scheduledDate = watch("scheduled_date");
  const startTime = watch("start_time");
  const dateFrom = manilaDateKey();
  const dateTo = addDaysToDateKey(dateFrom, AVAILABILITY_RANGE_DAYS);
  const servicesQuery = useResidentBookingServices(open);
  const selectedService = servicesQuery.data?.find(
    (service) => service.service_type === serviceType,
  );
  const automaticBooking = selectedService?.booking_mode === "AUTO_SLOT";
  const availabilityParameters = useMemo(
    () => ({ serviceType, dateFrom, dateTo }),
    [dateFrom, dateTo, serviceType],
  );
  const availabilityQuery = useResidentAppointmentAvailability(
    availabilityParameters,
    open && automaticBooking,
  );
  const slots = availabilityQuery.data ?? EMPTY_SLOTS;
  const availableDates = useMemo(
    () => [...new Set(slots.map((slot) => slot.scheduled_date))],
    [slots],
  );
  const availableTimes = useMemo(
    () => slots.filter((slot) => slot.scheduled_date === scheduledDate),
    [scheduledDate, slots],
  );
  const selectedSlot = availableTimes.find(
    (slot) => slot.start_time === startTime,
  );
  const serviceRegistration = register("service_type");

  useDialogDraftLifecycle({
    open,
    draftKey: "resident-appointment-request",
    resetDraft: () => {
      requestKey.current = crypto.randomUUID();
      mutation.reset();
      setConfirmedAppointment(null);
      reset(defaults());
    },
  });

  async function submit(values) {
    try {
      const result = await mutation.mutateAsync(values);
      const confirmation = {
        ...result,
        service_type: values.service_type,
        scheduled_date: values.scheduled_date,
        start_time: values.start_time,
        end_time: selectedSlot?.end_time,
      };
      setConfirmedAppointment(confirmation);
      toast.success("Appointment confirmed", {
        description: `${result.appointment_number} is confirmed for ${formatManilaDate(values.scheduled_date)} at ${formatManilaTime(values.start_time)}.`,
      });
      onSaved?.(confirmation);
    } catch (error) {
      if (error?.code === "slot_unavailable") {
        setValue("start_time", "", { shouldValidate: true });
        await availabilityQuery.refetch();
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>
            Choose from currently available Barangay Bagongpook service dates
            and times. Availability is checked again securely when you book.
          </DialogDescription>
        </DialogHeader>

        {confirmedAppointment ? (
          <div className="space-y-5">
            <section
              className="rounded-xl border border-primary/20 bg-primary/5 p-5"
              aria-labelledby="appointment-confirmed-heading"
            >
              <CheckCircle2
                className="h-8 w-8 text-primary"
                aria-hidden="true"
              />
              <h3
                id="appointment-confirmed-heading"
                className="mt-3 font-heading text-xl font-semibold"
              >
                Appointment confirmed
              </h3>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Reference</dt>
                  <dd className="font-semibold">
                    {confirmedAppointment.appointment_number}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Service</dt>
                  <dd className="font-semibold">
                    {confirmedAppointment.service_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-semibold">
                    {formatManilaDate(confirmedAppointment.scheduled_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Time</dt>
                  <dd className="font-semibold">
                    {formatManilaTime(confirmedAppointment.start_time)}–
                    {formatManilaTime(confirmedAppointment.end_time)}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-muted-foreground">
                The system validated the slot, assigned eligible staff, and
                confirmed the appointment automatically.
              </p>
            </section>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {mutation.error ? (
              <Alert variant="destructive">
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit(submit)}>
              <section className="space-y-2" aria-labelledby="booking-step-1">
                <h3 id="booking-step-1" className="font-heading font-semibold">
                  Step 1 · Choose service
                </h3>
                <Label htmlFor="resident-request-service">Service</Label>
                <select
                  id="resident-request-service"
                  {...serviceRegistration}
                  onChange={(event) => {
                    serviceRegistration.onChange(event);
                    setValue("scheduled_date", "");
                    setValue("start_time", "");
                    mutation.reset();
                  }}
                  disabled={mutation.isPending || servicesQuery.isLoading}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {(servicesQuery.data ?? []).map((service) => (
                    <option
                      key={service.service_type}
                      value={service.service_type}
                    >
                      {service.service_type}
                    </option>
                  ))}
                </select>
                <FieldError error={errors.service_type} />
                {servicesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading booking rules…
                  </p>
                ) : servicesQuery.isError ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {servicesQuery.error.message}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </section>

              {selectedService?.booking_mode === "COORDINATION_REQUIRED" ? (
                <Alert>
                  <AlertDescription>
                    Postpartum Home Visit requires coordination after childbirth
                    and is not an instant self-booking service. Use Inquiries or
                    contact the Barangay Health Center to arrange the home
                    visit.
                  </AlertDescription>
                </Alert>
              ) : null}

              {automaticBooking ? (
                <>
                  <section
                    className="space-y-2"
                    aria-labelledby="booking-step-2"
                  >
                    <h3
                      id="booking-step-2"
                      className="font-heading font-semibold"
                    >
                      Step 2 · Choose available date
                    </h3>
                    <Label htmlFor="resident-request-date">
                      Available date
                    </Label>
                    <select
                      id="resident-request-date"
                      {...register("scheduled_date")}
                      onChange={(event) => {
                        setValue("scheduled_date", event.target.value, {
                          shouldValidate: true,
                        });
                        setValue("start_time", "");
                        mutation.reset();
                      }}
                      disabled={
                        mutation.isPending ||
                        availabilityQuery.isLoading ||
                        availableDates.length === 0
                      }
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select an available date</option>
                      {availableDates.map((date) => (
                        <option key={date} value={date}>
                          {formatManilaDate(date)}
                        </option>
                      ))}
                    </select>
                    <FieldError error={errors.scheduled_date} />
                    {availabilityQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Checking service dates and staff capacity…
                      </p>
                    ) : availabilityQuery.isError ? (
                      <div className="space-y-2">
                        <p className="text-sm text-destructive">
                          {availabilityQuery.error.message}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => availabilityQuery.refetch()}
                        >
                          Try again
                        </Button>
                      </div>
                    ) : availableDates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No appointment dates currently have eligible staff
                        capacity. Check again later or contact the health
                        center.
                      </p>
                    ) : null}
                  </section>

                  <section
                    className="space-y-2"
                    aria-labelledby="booking-step-3"
                  >
                    <h3
                      id="booking-step-3"
                      className="font-heading font-semibold"
                    >
                      Step 3 · Choose available time
                    </h3>
                    <Label htmlFor="resident-request-start">
                      Available time
                    </Label>
                    <select
                      id="resident-request-start"
                      {...register("start_time")}
                      disabled={
                        mutation.isPending ||
                        !scheduledDate ||
                        availableTimes.length === 0
                      }
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select an available time</option>
                      {availableTimes.map((slot) => (
                        <option key={slot.start_time} value={slot.start_time}>
                          {formatManilaTime(slot.start_time)}–
                          {formatManilaTime(slot.end_time)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      The current appointment booking window uses 30-minute
                      slots from 8:00 AM through 4:00 PM, Asia/Manila. This is
                      not a statement of official health-center opening hours.
                    </p>
                    <FieldError error={errors.start_time} />
                  </section>

                  <section
                    className="space-y-3 rounded-xl border p-4"
                    aria-labelledby="booking-step-4"
                  >
                    <h3
                      id="booking-step-4"
                      className="font-heading font-semibold"
                    >
                      Step 4 · Review and book
                    </h3>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Service</dt>
                        <dd className="font-medium">{serviceType}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Duration</dt>
                        <dd className="font-medium">
                          {selectedService.slot_duration_minutes} minutes
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Date</dt>
                        <dd className="font-medium">
                          {scheduledDate
                            ? formatManilaDate(scheduledDate)
                            : "Select a date"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Time</dt>
                        <dd className="font-medium">
                          {selectedSlot
                            ? `${formatManilaTime(selectedSlot.start_time)}–${formatManilaTime(selectedSlot.end_time)}`
                            : "Select a time"}
                        </dd>
                      </div>
                    </dl>

                    <div className="space-y-2">
                      <Label htmlFor="resident-request-reason">
                        Reason for visit (optional)
                      </Label>
                      <textarea
                        id="resident-request-reason"
                        rows={4}
                        disabled={mutation.isPending}
                        {...register("reason")}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        Share only what the health center needs. This text is
                        excluded from broad lists, calendars, queues, audit
                        metadata, and diagnostics.
                      </p>
                      <FieldError error={errors.reason} />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      The database will recheck the service schedule, your
                      eligibility, current capacity, and staff availability
                      before confirming. Assigned staff is selected
                      automatically.
                    </p>
                  </section>
                </>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => onOpenChange(false)}
                >
                  Back
                </Button>
                {automaticBooking ? (
                  <Button
                    type="submit"
                    disabled={
                      mutation.isPending ||
                      !selectedSlot ||
                      availabilityQuery.isLoading
                    }
                  >
                    {mutation.isPending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <CalendarPlus />
                    )}
                    {mutation.isPending ? "Confirming…" : "Book appointment"}
                  </Button>
                ) : null}
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
