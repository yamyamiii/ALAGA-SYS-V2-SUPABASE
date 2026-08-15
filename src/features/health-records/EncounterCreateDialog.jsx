import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { AppointmentResidentField } from "@/features/appointments/AppointmentResidentField";
import { useAuth } from "@/features/auth/authContext";
import {
  ENCOUNTER_TYPES,
  ENCOUNTER_TYPE_LABELS,
} from "@/features/health-records/constants";
import { useHealthRecordMutation } from "@/features/health-records/hooks";
import { encounterCreateSchema } from "@/features/health-records/schemas";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { healthRecordService } from "@/services/healthRecordService";

function currentManilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaultEncounterType(appointment, role) {
  if (appointment?.service_type === "Maternal Care") return "maternal_care";
  if (appointment?.service_type === "Child Health") return "child_health";
  return role === "midwife" ? "maternal_care" : "general_consultation";
}

export function EncounterCreateDialog({
  open,
  onOpenChange,
  appointment = null,
  onCreated,
}) {
  const { profile } = useAuth();
  const requestKey = useRef(crypto.randomUUID());
  const [selectedResident, setSelectedResident] = useState(
    appointment?.resident ?? null,
  );
  const encounterTypes =
    profile.role === "midwife"
      ? ENCOUNTER_TYPES.filter((type) =>
          ["maternal_care", "child_health"].includes(type),
        )
      : ENCOUNTER_TYPES;
  const mutation = useHealthRecordMutation((values) =>
    healthRecordService.create(values, requestKey.current),
  );
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(encounterCreateSchema),
    defaultValues: {
      resident_id: appointment?.resident_id ?? "",
      appointment_id: appointment?.id ?? "",
      encounter_type: defaultEncounterType(appointment, profile.role),
      encounter_date: appointment?.scheduled_date ?? currentManilaDate(),
    },
  });

  useDialogDraftLifecycle({
    open,
    draftKey: `${appointment?.id ?? "new"}:${profile.role}`,
    resetDraft: () => {
      const resident = appointment?.resident ?? null;
      requestKey.current = crypto.randomUUID();
      setSelectedResident(resident);
      mutation.reset();
      reset({
        resident_id: appointment?.resident_id ?? "",
        appointment_id: appointment?.id ?? "",
        encounter_type: defaultEncounterType(appointment, profile.role),
        encounter_date: appointment?.scheduled_date ?? currentManilaDate(),
      });
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const created = await mutation.mutateAsync(values);
      toast.success(`Created ${created.encounter_number}.`);
      onOpenChange(false);
      onCreated?.(created);
    } catch (error) {
      toast.error(error.message);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create clinical encounter</DialogTitle>
          <DialogDescription>
            Create a draft record. Appointment notes are never copied into
            clinical documentation.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Resident</Label>
            <Controller
              control={control}
              name="resident_id"
              render={({ field }) => (
                <AppointmentResidentField
                  value={field.value}
                  selected={selectedResident}
                  disabled={Boolean(appointment) || mutation.isPending}
                  onChange={(resident) => {
                    setSelectedResident(resident);
                    field.onChange(resident?.id ?? "");
                    setValue("appointment_id", "");
                  }}
                />
              )}
            />
            {errors.resident_id ? (
              <p className="text-xs text-destructive">
                {errors.resident_id.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="encounter-type">Encounter type</Label>
              <select
                id="encounter-type"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                disabled={mutation.isPending}
                {...register("encounter_type")}
              >
                {encounterTypes.map((type) => (
                  <option key={type} value={type}>
                    {ENCOUNTER_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="encounter-date">Encounter date</Label>
              <Input
                id="encounter-date"
                type="date"
                max={currentManilaDate()}
                disabled={mutation.isPending}
                {...register("encounter_date")}
              />
              {errors.encounter_date ? (
                <p className="text-xs text-destructive">
                  {errors.encounter_date.message}
                </p>
              ) : null}
            </div>
          </div>
          {appointment ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              Linked appointment:{" "}
              <strong>{appointment.appointment_number}</strong>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating draft…" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
