import { Home, LoaderCircle, Search, UsersRound, X } from "lucide-react";
import { useState } from "react";
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
import { HouseholdSearchField } from "@/features/registry/HouseholdSearchField";
import { useRegistryMutation } from "@/features/registry/hooks";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { registryService } from "@/services/registryService";

export function ResidentHouseholdDialog({
  open,
  onOpenChange,
  resident,
  onSaved,
}) {
  const [selectedHousehold, setSelectedHousehold] = useState(null);
  const [assignmentMode, setAssignmentMode] = useState("none");
  const mutation = useRegistryMutation(async (household) => {
    if (!household) {
      return registryService.removeResidentFromHousehold(resident.id);
    }
    return registryService.assignResidentToHousehold(resident.id, household);
  });

  useDialogDraftLifecycle({
    open,
    draftKey: resident?.id ?? "none",
    resetDraft: () => {
      const currentHousehold =
        resident?.household_id && resident?.household
          ? {
              ...resident.household,
              id: resident.household_id,
              barangay_id: resident.barangay_id,
              purok_id: resident.purok_id,
            }
          : null;
      setSelectedHousehold(currentHousehold);
      setAssignmentMode(currentHousehold ? "selected" : "none");
      mutation.reset();
    },
  });

  function chooseHousehold(household) {
    setSelectedHousehold(household);
    setAssignmentMode(household ? "selected" : "none");
  }

  function clearAssignment() {
    setSelectedHousehold(null);
    setAssignmentMode("none");
    mutation.reset();
  }

  async function save() {
    await mutation.mutateAsync(selectedHousehold);
    toast.success(
      selectedHousehold ? "Household assigned" : "Household removed",
    );
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={mutation.isPending ? undefined : onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Household assignment</DialogTitle>
          <DialogDescription>
            Search current households in the resident&apos;s Bagongpook purok.
            Removing an assignment does not delete the resident.
          </DialogDescription>
        </DialogHeader>
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label>Household</Label>
          {assignmentMode === "selected" && selectedHousehold ? (
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Home className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {selectedHousehold.household_number}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedHousehold.address_line || "No address recorded"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Clear household assignment"
                  onClick={clearAssignment}
                  disabled={mutation.isPending}
                >
                  <X />
                </Button>
              </div>
            </div>
          ) : assignmentMode === "search" ? (
            <HouseholdSearchField
              purokId={resident?.purok_id}
              value=""
              selectedHousehold={null}
              onChange={chooseHousehold}
              disabled={mutation.isPending}
            />
          ) : (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <div>
                <p className="font-semibold">No household</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {resident?.household_id
                    ? "Save this assignment to remove the Resident from the current household."
                    : "The Resident is not assigned to a household."}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAssignmentMode("search")}
                disabled={mutation.isPending}
              >
                <Search /> Search for a household
              </Button>
            </div>
          )}
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
          <Button type="button" onClick={save} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <UsersRound />
            )}
            {mutation.isPending ? "Saving…" : "Save assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
