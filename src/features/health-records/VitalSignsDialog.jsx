import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useHealthRecordMutation } from "@/features/health-records/hooks";
import {
  calculateBmi,
  getVitalWarnings,
  vitalSignsSchema,
} from "@/features/health-records/schemas";
import { healthRecordService } from "@/services/healthRecordService";

const fields = [
  ["temperature_c", "Temperature", "°C", "0.1"],
  ["systolic_bp", "Systolic blood pressure", "mmHg", "1"],
  ["diastolic_bp", "Diastolic blood pressure", "mmHg", "1"],
  ["pulse_bpm", "Pulse", "bpm", "1"],
  ["respiratory_rate", "Respiratory rate", "breaths/min", "1"],
  ["oxygen_saturation", "Oxygen saturation", "%", "0.1"],
  ["height_cm", "Height", "cm", "0.1"],
  ["weight_kg", "Weight", "kg", "0.1"],
  ["pain_score", "Pain score", "0–10", "1"],
];

export function VitalSignsDialog({ encounter, open, onOpenChange, onSaved }) {
  const mutation = useHealthRecordMutation((values) =>
    healthRecordService.saveVitals(encounter.id, values),
  );
  const {
    control,
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(vitalSignsSchema),
    defaultValues: {},
  });
  const values = useWatch({ control });
  const warnings = useMemo(() => getVitalWarnings(values ?? {}), [values]);
  const bmi = calculateBmi(values?.height_cm, values?.weight_kg);

  useEffect(() => {
    if (!open) return;
    reset(
      Object.fromEntries(
        fields.map(([name]) => [name, encounter?.vital_signs?.[name] ?? ""]),
      ),
    );
  }, [encounter, open, reset]);

  const submit = handleSubmit(async (formValues) => {
    try {
      await mutation.mutateAsync(formValues);
      toast.success("Vital signs saved.");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error.message);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record vital signs</DialogTitle>
          <DialogDescription>
            Unusual values produce verification warnings, not diagnoses.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(([name, label, unit, step]) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name}>
                  {label}{" "}
                  <span className="text-muted-foreground">({unit})</span>
                </Label>
                <Input
                  id={name}
                  type="number"
                  step={step}
                  disabled={mutation.isPending}
                  {...register(name)}
                />
                {errors[name] ? (
                  <p className="text-xs text-destructive">
                    {errors[name].message}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="text-sm">
            Calculated BMI:{" "}
            <strong>{bmi ?? "Requires height and weight"}</strong>
          </p>
          {warnings.length ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Verify unusual measurements</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {errors.root ? (
            <p className="text-sm text-destructive">{errors.root.message}</p>
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
              {mutation.isPending ? "Saving…" : "Save vital signs"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
