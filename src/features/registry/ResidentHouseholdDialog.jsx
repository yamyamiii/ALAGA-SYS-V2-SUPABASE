import { LoaderCircle, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
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
  useHouseholdOptions,
  useRegistryMutation,
} from "@/features/registry/hooks";
import { registryService } from "@/services/registryService";

export function ResidentHouseholdDialog({
  open,
  onOpenChange,
  resident,
  onSaved,
}) {
  const [householdId, setHouseholdId] = useState("");
  const options = useHouseholdOptions(resident?.purok_id);
  const mutation = useRegistryMutation(async (selectedId) => {
    if (!selectedId) {
      return registryService.removeResidentFromHousehold(resident.id);
    }
    const household = options.data?.find((item) => item.id === selectedId);
    if (!household) throw new Error("Select a valid household.");
    return registryService.assignResidentToHousehold(resident.id, household);
  });

  useEffect(() => {
    if (open) {
      setHouseholdId(resident?.household_id ?? "");
      mutation.reset();
    }
  }, [open, resident?.household_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    await mutation.mutateAsync(householdId);
    toast.success(householdId ? "Household assigned" : "Household removed");
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
            Only current households in the resident&apos;s Bagongpook purok are
            available. Removing an assignment does not delete the resident.
          </DialogDescription>
        </DialogHeader>
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="resident-household-assignment">Household</Label>
          <select
            id="resident-household-assignment"
            value={householdId}
            onChange={(event) => setHouseholdId(event.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">No household</option>
            {(options.data ?? []).map((household) => (
              <option key={household.id} value={household.id}>
                {household.household_number} — {household.address_line}
              </option>
            ))}
          </select>
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
          <Button
            type="button"
            onClick={save}
            disabled={mutation.isPending || options.isLoading}
          >
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
