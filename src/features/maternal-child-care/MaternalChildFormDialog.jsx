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
import { AppointmentResidentField } from "@/features/appointments/AppointmentResidentField";
import { useMaternalChildMutation } from "@/features/maternal-child-care/hooks";
import { validateMaternalChildForm } from "@/features/maternal-child-care/schemas";
import { maternalChildService } from "@/services/maternalChildService";

const pregnancyDefaults = {
  resident_id: "",
  last_menstrual_period: "",
  estimated_delivery_date: "",
  gravida: 1,
  para: 0,
  term_births: 0,
  preterm_births: 0,
  abortions: 0,
  living_children: 0,
  pregnancy_risk_level: "unassessed",
  risk_notes: "",
};
const childDefaults = {
  child_resident_id: "",
  mother_resident_id: "",
  guardian_resident_id: "",
  birth_date: "",
  birth_weight_kg: "",
  birth_length_cm: "",
  gestational_age_weeks: "",
  birth_place: "",
  delivery_type: "",
  newborn_screening_status: "",
  blood_type: "unknown",
};

function Field({ label, name, value, onChange, ...props }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        {...props}
      />
    </label>
  );
}

export function MaternalChildFormDialog({ open, onOpenChange, kind }) {
  const [values, setValues] = useState(
    kind === "pregnancy" ? pregnancyDefaults : childDefaults,
  );
  const [error, setError] = useState("");
  const [selectedResident, setSelectedResident] = useState(null);
  const mutation = useMaternalChildMutation((payload) =>
    kind === "pregnancy"
      ? maternalChildService.savePregnancy(payload)
      : maternalChildService.saveChildProfile(payload),
  );

  function update(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const parsed = validateMaternalChildForm(kind, values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the form values.");
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
      toast.success(
        kind === "pregnancy"
          ? "Pregnancy record created."
          : "Child health profile created.",
      );
      setValues(kind === "pregnancy" ? pregnancyDefaults : childDefaults);
      onOpenChange(false);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {kind === "pregnancy"
              ? "New pregnancy record"
              : "New child profile"}
          </DialogTitle>
          <DialogDescription>
            Select an active registry resident. The database validates sex,
            birth date, relationships, duplicates, and role scope.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {kind === "pregnancy" ? (
              <>
                <div className="space-y-1 sm:col-span-2">
                  <span className="text-sm font-medium">Resident</span>
                  <AppointmentResidentField
                    value={values.resident_id}
                    selected={selectedResident}
                    disabled={mutation.isPending}
                    onChange={(resident) => {
                      setSelectedResident(resident);
                      update("resident_id", resident?.id ?? "");
                    }}
                  />
                </div>
                <Field
                  label="Last menstrual period"
                  name="last_menstrual_period"
                  type="date"
                  value={values.last_menstrual_period}
                  onChange={update}
                  required
                />
                <Field
                  label="Estimated delivery date"
                  name="estimated_delivery_date"
                  type="date"
                  value={values.estimated_delivery_date}
                  onChange={update}
                  required
                />
                {[
                  ["gravida", "Gravida"],
                  ["para", "Para"],
                  ["term_births", "Term births"],
                  ["preterm_births", "Preterm births"],
                  ["abortions", "Pregnancy losses"],
                  ["living_children", "Living children"],
                ].map(([name, label]) => (
                  <Field
                    key={name}
                    label={label}
                    name={name}
                    type="number"
                    min="0"
                    value={values[name]}
                    onChange={update}
                  />
                ))}
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Risk level</span>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3"
                    value={values.pregnancy_risk_level}
                    onChange={(event) =>
                      update("pregnancy_risk_level", event.target.value)
                    }
                  >
                    <option value="unassessed">Unassessed</option>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                <div className="space-y-1 sm:col-span-2">
                  <span className="text-sm font-medium">Child resident</span>
                  <AppointmentResidentField
                    value={values.child_resident_id}
                    selected={selectedResident}
                    disabled={mutation.isPending}
                    onChange={(resident) => {
                      setSelectedResident(resident);
                      update("child_resident_id", resident?.id ?? "");
                      update("birth_date", resident?.date_of_birth ?? "");
                    }}
                  />
                </div>
                <Field
                  label="Birth date"
                  name="birth_date"
                  type="date"
                  value={values.birth_date}
                  onChange={update}
                  required
                />
                <Field
                  label="Mother resident UUID (optional)"
                  name="mother_resident_id"
                  value={values.mother_resident_id}
                  onChange={update}
                />
                <Field
                  label="Guardian resident UUID (optional)"
                  name="guardian_resident_id"
                  value={values.guardian_resident_id}
                  onChange={update}
                />
                <Field
                  label="Birth weight (kg)"
                  name="birth_weight_kg"
                  type="number"
                  step="0.01"
                  value={values.birth_weight_kg}
                  onChange={update}
                />
                <Field
                  label="Birth length (cm)"
                  name="birth_length_cm"
                  type="number"
                  step="0.1"
                  value={values.birth_length_cm}
                  onChange={update}
                />
                <Field
                  label="Birth place"
                  name="birth_place"
                  value={values.birth_place}
                  onChange={update}
                />
                <Field
                  label="Delivery type"
                  name="delivery_type"
                  value={values.delivery_type}
                  onChange={update}
                />
              </>
            )}
          </div>
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
              {mutation.isPending ? "Saving…" : "Create record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
