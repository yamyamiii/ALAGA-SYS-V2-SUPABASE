import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
import { AppointmentStartTimeSelect } from "@/features/appointments/AppointmentStartTimeSelect";
import { useAppointmentStaffSearch } from "@/features/appointments/hooks";
import {
  addDaysToDateKey,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { healthEventService } from "@/services/healthEventService";
import { useHealthEventMutation } from "./hooks";
import { equalAllocation, EVENT_SERVICES, healthEventSchema } from "./schemas";

const initial = () => ({
  title: "",
  service_type: "Immunization",
  event_date: addDaysToDateKey(manilaDateKey(new Date()), 1),
  start_time: "08:00",
  end_time: "12:00",
  capacity: 60,
  staff_ids: [],
  publish: true,
  notify: true,
});
export function HealthEventFormDialog({ open, onOpenChange, record }) {
  const key = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const [search, setSearch] = useState("");
  const [staffPage, setStaffPage] = useState(1);
  const form = useForm({
    resolver: zodResolver(healthEventSchema),
    defaultValues: initial(),
  });
  const values = form.watch();
  const staff = useAppointmentStaffSearch(
    { search, serviceType: values.service_type, page: staffPage, pageSize: 25 },
    open,
  );
  const mutation = useHealthEventMutation((v) =>
    healthEventService.save(record, v, key.current),
  );
  useDialogDraftLifecycle({
    open,
    draftKey: record?.id ?? "new",
    resetDraft: () => {
      form.reset(
        record
          ? {
              ...initial(),
              title: record.title,
              service_type: record.service_type,
              event_date: record.event_date,
              start_time: record.start_time.slice(0, 5),
              end_time: record.end_time.slice(0, 5),
              capacity: record.capacity,
              staff_ids: (record.staff ?? []).map((s) => s.id),
              publish: record.status !== "draft",
              notify: false,
            }
          : initial(),
      );
      key.current = crypto.randomUUID();
      setSearch("");
      setStaffPage(1);
      mutation.reset();
    },
  });
  const choices = [
    ...new Map(
      [...(record?.staff ?? []), ...(staff.data?.items ?? [])].map((s) => [
        s.id,
        s,
      ]),
    ).values(),
  ];
  const name = (s) =>
    s.name ?? [s.first_name, s.last_name].filter(Boolean).join(" ");
  const submit = form.handleSubmit(async (v) => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await mutation.mutateAsync(v);
      toast.success(
        v.publish ? "Health service event published" : "Event draft saved",
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      submitting.current = false;
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {record ? "Edit" : "Create"} health service event
          </DialogTitle>
          <DialogDescription>
            Configure once. Eligible Resident bookings are confirmed and
            assigned automatically. All times are Asia/Manila.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              maxLength={200}
              {...form.register("title")}
            />
          </div>
          <div>
            <Label htmlFor="event-service">Service</Label>
            <select
              id="event-service"
              className="h-11 w-full rounded-md border bg-background px-3"
              {...form.register("service_type", {
                onChange: () => {
                  form.setValue("staff_ids", []);
                  setStaffPage(1);
                },
              })}
            >
              {EVENT_SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="event-date">Event date</Label>
            <Input
              id="event-date"
              type="date"
              min={manilaDateKey(new Date())}
              {...form.register("event_date")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="event-start">Start</Label>
              <AppointmentStartTimeSelect
                id="event-start"
                {...form.register("start_time")}
              />
            </div>
            <div>
              <Label htmlFor="event-end">End</Label>
              <Input
                id="event-end"
                type="time"
                max="16:30"
                {...form.register("end_time")}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="event-capacity">Target capacity</Label>
            <Input
              id="event-capacity"
              type="number"
              min={1}
              max={1000}
              {...form.register("capacity")}
            />
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend>Participating eligible staff</legend>
            <Input
              aria-label="Search event staff"
              placeholder="Search eligible staff"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setStaffPage(1);
              }}
            />
            {staff.isError ? (
              <p role="alert">{staff.error.message}</p>
            ) : staff.isLoading ? (
              <p role="status">Loading eligible staff…</p>
            ) : null}
            {choices.map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  value={s.id}
                  {...form.register("staff_ids")}
                />
                {name(s)}
              </label>
            ))}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={staffPage === 1}
                onClick={() => setStaffPage((p) => p - 1)}
              >
                Previous staff
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={staffPage * 25 >= (staff.data?.total ?? 0)}
                onClick={() => setStaffPage((p) => p + 1)}
              >
                More staff
              </Button>
            </div>
          </fieldset>
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p>
              Equal distribution · Capacity {values.capacity || 0} ·{" "}
              {values.staff_ids.length} staff
            </p>
            {equalAllocation(
              Number(values.capacity) || 0,
              values.staff_ids,
            ).map(({ id, quota }) => (
              <p key={id}>
                {name(choices.find((s) => s.id === id) ?? {}) ||
                  "Selected staff"}
                : {quota}
              </p>
            ))}
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" {...form.register("publish")} />
            Publish event
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" {...form.register("notify")} />
            Create linked announcement and notify Residents
          </label>
          {Object.entries(form.formState.errors).map(([field, error]) => (
            <p key={field} role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          ))}
          {mutation.isError ? (
            <p role="alert" className="text-destructive">
              {mutation.error.message}
            </p>
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
            <Button disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : record
                  ? "Save event"
                  : values.publish
                    ? "Publish event"
                    : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
