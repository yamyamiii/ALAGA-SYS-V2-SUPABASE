import { LoaderCircle, UsersRound } from "lucide-react";
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
      setSelectedHousehold(
        resident?.household_id && resident?.household
          ? {
              ...resident.household,
              id: resident.household_id,
              barangay_id: resident.barangay_id,
              purok_id: resident.purok_id,
            }
          : null,
      );
      mutation.reset();
    },
  });

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
          <HouseholdSearchField
            purokId={resident?.purok_id}
            value={selectedHousehold?.id ?? ""}
            selectedHousehold={selectedHousehold}
            onChange={setSelectedHousehold}
            disabled={mutation.isPending}
          />
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
