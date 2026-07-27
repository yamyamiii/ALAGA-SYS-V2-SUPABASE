import { useState } from "react";
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
import { useMaternalChildMutation } from "@/features/maternal-child-care/hooks";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { maternalChildService } from "@/services/maternalChildService";

const labels = {
  prenatal: "Prenatal visit",
  delivery: "Delivery outcome",
  postnatal: "Postnatal visit",
  growth: "Growth measurement",
  immunization: "Immunization entry",
  visit: "Child health visit",
};

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function defaults(type) {
  if (type === "delivery") {
    return {
      delivery_date: today(),
      delivery_type: "vaginal",
      delivery_place: "",
      outcome: "live_birth",
      newborn_count: 1,
      maternal_condition: "",
      notes: "",
    };
  }
  if (type === "growth") {
    return {
      appointment_id: "",
      encounter_id: "",
      measured_at: new Date().toISOString().slice(0, 16),
      weight_kg: "",
      height_cm: "",
      head_circumference_cm: "",
      mid_upper_arm_circumference_cm: "",
      notes: "",
    };
  }
  if (type === "immunization") {
    return {
      appointment_id: "",
      encounter_id: "",
      vaccine_code: "",
      vaccine_name: "",
      dose_number: 1,
      scheduled_date: "",
      administered_date: "",
      status: "due",
      facility: "",
      lot_number: "",
      notes: "",
    };
  }
  return {
    appointment_id: "",
    encounter_id: "",
    visit_date: today(),
    weight_kg: "",
    systolic_bp: "",
    diastolic_bp: "",
    findings: "",
    developmental_notes: "",
    plan: "",
    next_visit_date: "",
  };
}

function Field({ label, name, values, update, ...props }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        value={values[name] ?? ""}
        onChange={(event) => update(name, event.target.value)}
        {...props}
      />
    </label>
  );
}

export function MaternalChildEventDialog({
  open,
  onOpenChange,
  type,
  parentId,
}) {
  const [values, setValues] = useState(() => defaults(type));
  const [error, setError] = useState("");
  const mutation = useMaternalChildMutation((payload) => {
    if (type === "delivery") {
      return maternalChildService.saveDelivery(parentId, payload);
    }
    if (["prenatal", "postnatal"].includes(type)) {
      return maternalChildService.saveMaternalVisit(type, parentId, payload);
    }
    return maternalChildService.saveChildEvent(type, parentId, payload);
  });

  useDialogDraftLifecycle({
    open,
    draftKey: `${type}:${parentId ?? "none"}`,
    resetDraft: () => {
      setValues(defaults(type));
      setError("");
      mutation.reset();
    },
  });

  function update(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (
      (["prenatal", "postnatal", "visit"].includes(type) &&
        !values.visit_date) ||
      (type === "delivery" &&
        (!values.delivery_date ||
          !values.delivery_place.trim() ||
          !values.delivery_type ||
          !values.outcome)) ||
      (type === "growth" && !values.measured_at) ||
      (type === "immunization" &&
        (!values.vaccine_code.trim() ||
          !values.vaccine_name.trim() ||
          !values.status))
    ) {
      setError("Complete all required fields before saving.");
      return;
    }
    if (
      type === "growth" &&
      ![
        values.weight_kg,
        values.height_cm,
        values.head_circumference_cm,
        values.mid_upper_arm_circumference_cm,
      ].some(Boolean)
    ) {
      setError("Enter at least one growth measurement.");
      return;
    }
    try {
      await mutation.mutateAsync(values);
      toast.success(`${labels[type]} saved.`);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record {labels[type]?.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Clinical interpretation remains with authorized health staff. The
            service validates resident links, role scope, dates, and retries.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {["prenatal", "postnatal", "visit"].includes(type) ? (
              <>
                <Field
                  label="Visit date"
                  name="visit_date"
                  values={values}
                  update={update}
                  type="date"
                  required
                />
                <Field
                  label="Next visit date (optional)"
                  name="next_visit_date"
                  values={values}
                  update={update}
                  type="date"
                />
                <Field
                  label="Appointment UUID (optional)"
                  name="appointment_id"
                  values={values}
                  update={update}
                />
                <Field
                  label="Encounter UUID (optional)"
                  name="encounter_id"
                  values={values}
                  update={update}
                />
                {type !== "visit" ? (
                  <>
                    <Field
                      label="Systolic BP"
                      name="systolic_bp"
                      values={values}
                      update={update}
                      type="number"
                    />
                    <Field
                      label="Diastolic BP"
                      name="diastolic_bp"
                      values={values}
                      update={update}
                      type="number"
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {type === "delivery" ? (
              <>
                <Field
                  label="Delivery date"
                  name="delivery_date"
                  values={values}
                  update={update}
                  type="date"
                  required
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Delivery type</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3"
                    value={values.delivery_type}
                    onChange={(event) =>
                      update("delivery_type", event.target.value)
                    }
                  >
                    <option value="vaginal">Vaginal</option>
                    <option value="cesarean">Cesarean</option>
                    <option value="assisted">Assisted</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <Field
                  label="Delivery place"
                  name="delivery_place"
                  values={values}
                  update={update}
                  required
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Outcome</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3"
                    value={values.outcome}
                    onChange={(event) => update("outcome", event.target.value)}
                  >
                    <option value="live_birth">Live birth</option>
                    <option value="stillbirth">Stillbirth</option>
                    <option value="miscarriage">Miscarriage</option>
                    <option value="multiple_outcomes">Multiple outcomes</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <Field
                  label="Newborn count"
                  name="newborn_count"
                  values={values}
                  update={update}
                  type="number"
                  min="0"
                />
              </>
            ) : null}
            {type === "growth" ? (
              <>
                <Field
                  label="Measured at"
                  name="measured_at"
                  values={values}
                  update={update}
                  type="datetime-local"
                  required
                />
                <Field
                  label="Appointment UUID"
                  name="appointment_id"
                  values={values}
                  update={update}
                />
                {[
                  ["weight_kg", "Weight (kg)"],
                  ["height_cm", "Height (cm)"],
                  ["head_circumference_cm", "Head circumference (cm)"],
                  [
                    "mid_upper_arm_circumference_cm",
                    "Mid-upper arm circumference (cm)",
                  ],
                ].map(([name, label]) => (
                  <Field
                    key={name}
                    label={label}
                    name={name}
                    values={values}
                    update={update}
                    type="number"
                    step="0.01"
                  />
                ))}
              </>
            ) : null}
            {type === "immunization" ? (
              <>
                <Field
                  label="Appointment UUID (assigned nurse)"
                  name="appointment_id"
                  values={values}
                  update={update}
                />
                <Field
                  label="Encounter UUID (assigned nurse)"
                  name="encounter_id"
                  values={values}
                  update={update}
                />
                <Field
                  label="Vaccine code"
                  name="vaccine_code"
                  values={values}
                  update={update}
                  required
                />
                <Field
                  label="Vaccine name"
                  name="vaccine_name"
                  values={values}
                  update={update}
                  required
                />
                <Field
                  label="Dose number"
                  name="dose_number"
                  values={values}
                  update={update}
                  type="number"
                  min="1"
                />
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3"
                    value={values.status}
                    onChange={(event) => update("status", event.target.value)}
                  >
                    <option value="due">Due</option>
                    <option value="completed">Completed</option>
                    <option value="missed">Missed</option>
                    <option value="deferred">Deferred</option>
                  </select>
                </label>
                <Field
                  label="Scheduled date"
                  name="scheduled_date"
                  values={values}
                  update={update}
                  type="date"
                />
                <Field
                  label="Administered date"
                  name="administered_date"
                  values={values}
                  update={update}
                  type="date"
                />
              </>
            ) : null}
          </div>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">
              {type === "visit" ? "Developmental notes" : "Notes or findings"}
            </span>
            <textarea
              className="min-h-24 w-full rounded-lg border bg-background px-3 py-2"
              value={
                type === "visit"
                  ? values.developmental_notes
                  : (values.findings ?? values.notes ?? "")
              }
              onChange={(event) =>
                update(
                  type === "visit"
                    ? "developmental_notes"
                    : Object.hasOwn(values, "findings")
                      ? "findings"
                      : "notes",
                  event.target.value,
                )
              }
              maxLength={10000}
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : `Save ${labels[type]?.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
