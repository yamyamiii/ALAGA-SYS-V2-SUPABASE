import { LoaderCircle, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPersonName } from "@/features/registry/formatters";
import { registryKeys, useRegistryMutation } from "@/features/registry/hooks";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";
import { registryService } from "@/services/registryService";

export function HouseholdMemberDialog({
  open,
  onOpenChange,
  household,
  onSaved,
}) {
  const [search, setSearch] = useState("");
  const [residentId, setResidentId] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const residents = useQuery({
    queryKey: [
      ...registryKeys.members(household?.id),
      "assignable",
      debouncedSearch,
    ],
    queryFn: () =>
      registryService.listAssignableResidents({
        barangayId: household.barangay_id,
        purokId: household.purok_id,
        search: debouncedSearch,
      }),
    enabled: open && Boolean(household?.id),
  });
  const mutation = useRegistryMutation(() => {
    const resident = residents.data?.find((item) => item.id === residentId);
    if (!resident) throw new Error("Select a resident.");
    return registryService.assignResidentToHousehold(resident.id, household);
  });

  useEffect(() => {
    if (open) {
      setSearch("");
      setResidentId("");
      mutation.reset();
    }
  }, [open, household?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    await mutation.mutateAsync();
    toast.success("Resident added to household");
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
          <DialogTitle>Add existing resident</DialogTitle>
          <DialogDescription>
            Results are limited to current residents in the same barangay and
            purok.
          </DialogDescription>
        </DialogHeader>
        {mutation.error || residents.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {mutation.error?.message ?? residents.error?.message}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="member-search">Search by last name</Label>
          <Input
            id="member-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search current residents"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="member-resident">Resident</Label>
          <select
            id="member-resident"
            value={residentId}
            onChange={(event) => setResidentId(event.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            disabled={residents.isLoading}
          >
            <option value="">Select resident</option>
            {(residents.data ?? []).map((resident) => (
              <option key={resident.id} value={resident.id}>
                {resident.resident_number} — {formatPersonName(resident)}
                {resident.household_id ? " (reassign)" : ""}
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
            disabled={!residentId || mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <UserPlus />
            )}
            {mutation.isPending ? "Adding…" : "Add resident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
