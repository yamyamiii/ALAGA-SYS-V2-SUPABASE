import { zodResolver } from "@hookform/resolvers/zod";
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
import { useHealthRecordMutation } from "@/features/health-records/hooks";
import { encounterClinicalSchema } from "@/features/health-records/schemas";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { healthRecordService } from "@/services/healthRecordService";

const fields = [
  ["chief_complaint", "Chief complaint", 3, true],
  ["subjective_notes", "Subjective notes", 5, false],
  ["objective_notes", "Objective notes", 5, false],
  ["assessment", "Assessment", 5, true],
  ["diagnosis_text", "Diagnosis text", 3, false],
  ["plan", "Plan", 5, true],
  ["treatment_notes", "Treatment notes", 4, false],
];

export function EncounterClinicalFormDialog({
  encounter,
  open,
  onOpenChange,
  onSaved,
}) {
  const mutation = useHealthRecordMutation((values) =>
    healthRecordService.update(encounter, values),
  );
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(encounterClinicalSchema),
    defaultValues: {},
  });

  useDialogDraftLifecycle({
    open,
    draftKey: encounter?.id ?? "none",
    resetDraft: () => {
      mutation.reset();
      reset({
        chief_complaint: encounter?.clinical?.chief_complaint ?? "",
        subjective_notes: encounter?.clinical?.subjective_notes ?? "",
        objective_notes: encounter?.clinical?.objective_notes ?? "",
        assessment: encounter?.clinical?.assessment ?? "",
        diagnosis_text: encounter?.clinical?.diagnosis_text ?? "",
        plan: encounter?.clinical?.plan ?? "",
        treatment_notes: encounter?.clinical?.treatment_notes ?? "",
        follow_up_date: encounter?.clinical?.follow_up_date ?? "",
      });
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      toast.success("Draft clinical documentation saved.");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      toast.error(error.message);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit draft encounter</DialogTitle>
          <DialogDescription>
            Document clinical observations in sections. Signed records cannot be
            overwritten. Chief complaint, assessment, and plan must be completed
            before signing; incomplete drafts may still be saved.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          {fields.map(([name, label, rows, requiredForSigning]) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={name}>
                {label}
                {requiredForSigning ? " (required before signing)" : ""}
              </Label>
              <textarea
                id={name}
                rows={rows}
                aria-required={requiredForSigning}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <div className="max-w-xs space-y-2">
            <Label htmlFor="follow-up-date">Follow-up date</Label>
            <Input
              id="follow-up-date"
              type="date"
              disabled={mutation.isPending}
              {...register("follow_up_date")}
            />
          </div>
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
              {mutation.isPending ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
