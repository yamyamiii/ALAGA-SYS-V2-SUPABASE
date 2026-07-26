import { Archive, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
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
  ALLERGY_SEVERITIES,
  CLINICAL_ITEM_STATUSES,
} from "@/features/health-records/constants";
import { useHealthRecordMutation } from "@/features/health-records/hooks";
import {
  allergySchema,
  medicalHistorySchema,
} from "@/features/health-records/schemas";
import { healthRecordService } from "@/services/healthRecordService";

const emptyAllergy = {
  allergen: "",
  reaction: "",
  severity: "unknown",
  status: "active",
};
const emptyHistory = {
  condition_name: "",
  details: "",
  onset_date: "",
  status: "active",
};

export function ClinicalHistoryManager({
  type,
  residentId,
  items,
  canManage,
  onChanged,
  isLoading = false,
  error = null,
  onRetry,
}) {
  const allergy = type === "allergy";
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [values, setValues] = useState(allergy ? emptyAllergy : emptyHistory);
  const mutation = useHealthRecordMutation(async ({ mode, id, payload }) => {
    if (mode === "archive") {
      return allergy
        ? healthRecordService.archiveAllergy(id)
        : healthRecordService.archiveMedicalHistory(id);
    }
    return allergy
      ? healthRecordService.saveAllergy(residentId, payload, id)
      : healthRecordService.saveMedicalHistory(residentId, payload, id);
  });

  function startEdit(item = null) {
    setEditingId(item?.id ?? null);
    setValues(
      item
        ? allergy
          ? {
              allergen: item.allergen,
              reaction: item.reaction ?? "",
              severity: item.severity,
              status: item.status,
            }
          : {
              condition_name: item.condition_name,
              details: item.details ?? "",
              onset_date: item.onset_date ?? "",
              status: item.status,
            }
        : allergy
          ? emptyAllergy
          : emptyHistory,
    );
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      const parsed = (allergy ? allergySchema : medicalHistorySchema).parse(
        values,
      );
      await mutation.mutateAsync({
        mode: "save",
        id: editingId,
        payload: parsed,
      });
      toast.success(
        allergy ? "Allergy record saved." : "Medical history saved.",
      );
      setOpen(false);
      onChanged?.();
    } catch (error) {
      toast.error(error.issues?.[0]?.message ?? error.message);
    }
  }

  async function archive(item) {
    try {
      await mutation.mutateAsync({ mode: "archive", id: item.id });
      toast.success(
        allergy ? "Allergy archived." : "Medical history archived.",
      );
      onChanged?.();
    } catch (error) {
      toast.error(error.message);
    }
  }

  if (isLoading) {
    return (
      <LoadingState
        compact
        title={`Loading ${allergy ? "allergies" : "medical history"}`}
        description="Retrieving authorized clinical entries…"
      />
    );
  }
  if (error) {
    return (
      <ErrorState
        compact
        title={`${allergy ? "Allergies" : "Medical history"} unavailable`}
        description={error.message}
        actionLabel="Try again"
        onAction={onRetry}
      />
    );
  }

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length
            ? `${items.length} active or historical entr${items.length === 1 ? "y" : "ies"}`
            : "No active entries documented"}
        </p>
        {canManage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => startEdit()}
          >
            <Plus /> Add
          </Button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {allergy ? item.allergen : item.condition_name}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {allergy ? item.reaction : item.details || "No details"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {allergy ? `${item.severity} · ` : ""}
                  {item.status}
                  {!allergy && item.onset_date
                    ? ` · Onset ${item.onset_date}`
                    : ""}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${allergy ? "allergy" : "medical history"}`}
                    onClick={() => startEdit(item)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Archive ${allergy ? "allergy" : "medical history"}`}
                    disabled={mutation.isPending}
                    onClick={() => archive(item)}
                  >
                    <Archive />
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit" : "Add"}{" "}
              {allergy ? "allergy" : "medical history"}
            </DialogTitle>
            <DialogDescription>
              This information is clinical and is never copied into appointment
              overviews or audit snapshots.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            <div className="space-y-2">
              <Label htmlFor="clinical-item-name">
                {allergy ? "Allergen" : "Condition"}
              </Label>
              <Input
                id="clinical-item-name"
                value={allergy ? values.allergen : values.condition_name}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [allergy ? "allergen" : "condition_name"]:
                      event.target.value,
                  }))
                }
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clinical-item-details">
                {allergy ? "Reaction" : "Details"}
              </Label>
              <textarea
                id="clinical-item-details"
                rows={4}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={allergy ? values.reaction : values.details}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [allergy ? "reaction" : "details"]: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {allergy ? (
                <div className="space-y-2">
                  <Label htmlFor="allergy-severity">Severity</Label>
                  <select
                    id="allergy-severity"
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    value={values.severity}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        severity: event.target.value,
                      }))
                    }
                  >
                    {ALLERGY_SEVERITIES.map((severity) => (
                      <option key={severity}>{severity}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="history-onset">Onset date</Label>
                  <Input
                    id="history-onset"
                    type="date"
                    value={values.onset_date}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        onset_date: event.target.value,
                      }))
                    }
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="clinical-item-status">Status</Label>
                <select
                  id="clinical-item-status"
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                  value={values.status}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  {CLINICAL_ITEM_STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
