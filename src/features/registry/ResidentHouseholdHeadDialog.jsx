import { LoaderCircle, UserRoundCog } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
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
import { formatPersonName } from "@/features/registry/formatters";
import {
  useHouseholdMembers,
  useRegistryMutation,
} from "@/features/registry/hooks";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { registryService } from "@/services/registryService";

export function ResidentHouseholdHeadDialog({
  open,
  onOpenChange,
  resident,
  continueToArchive = false,
  canArchiveSoleHousehold = false,
  onResolved,
  onSoleArchived,
}) {
  const householdId = resident?.household_id;
  const members = useHouseholdMembers(householdId, open);
  const [replacementId, setReplacementId] = useState("");
  const mutation = useRegistryMutation((newHeadId) =>
    registryService.reassignHouseholdHead(householdId, resident.id, newHeadId),
  );
  const archiveMutation = useRegistryMutation(() =>
    registryService.archiveSoleMemberHousehold({
      residentId: resident.id,
      householdId,
      residentUpdatedAt: resident.updated_at,
      householdUpdatedAt: resident.household?.updated_at,
    }),
  );

  useDialogDraftLifecycle({
    open,
    draftKey: `${resident?.id ?? "none"}:${householdId ?? "none"}`,
    resetDraft: () => {
      setReplacementId("");
      mutation.reset();
      archiveMutation.reset();
    },
  });

  const otherMembers = useMemo(
    () => (members.data ?? []).filter((member) => member.id !== resident?.id),
    [members.data, resident?.id],
  );
  const eligibleMembers = useMemo(
    () =>
      otherMembers.filter(
        (member) =>
          member.household_id === householdId &&
          member.status === "active" &&
          !member.archived_at,
      ),
    [householdId, otherMembers],
  );

  async function save() {
    try {
      const result = await mutation.mutateAsync(replacementId);
      toast.success("Household head updated");
      onResolved?.({ newHeadId: result.head_resident_id });
    } catch {
      // The safe mapped error remains visible in this dialog.
    }
  }

  async function archiveSoleMemberHousehold() {
    try {
      await archiveMutation.mutateAsync();
      toast.success("Resident and household archived");
      onSoleArchived?.();
    } catch {
      // The safe mapped error remains visible in this dialog.
    }
  }

  const noEligibleReplacement =
    !members.isLoading && !members.isError && eligibleMembers.length === 0;
  const canResolveSoleMember =
    continueToArchive && canArchiveSoleHousehold && noEligibleReplacement;
  const pending = mutation.isPending || archiveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {canResolveSoleMember
              ? "Archive resident and household?"
              : "Change household head"}
          </DialogTitle>
          <DialogDescription>
            {canResolveSoleMember
              ? "This Resident is the only active member and household head. The Resident will be archived and the empty household will also be archived."
              : "This Resident is the household head. Select another active member of the same household before archiving or removing the Resident."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
          <p className="font-semibold">
            {resident?.household?.household_number ?? "Current household"}
          </p>
          <p className="mt-1 text-muted-foreground">
            Current head: {formatPersonName(resident)}
          </p>
        </div>

        {members.isLoading ? (
          <LoadingState compact title="Loading eligible household members" />
        ) : members.isError ? (
          <ErrorState
            compact
            title="Household members unavailable"
            description={members.error.message}
            actionLabel="Try again"
            onAction={() => members.refetch()}
          />
        ) : noEligibleReplacement ? (
          <Alert>
            <AlertDescription>
              {canResolveSoleMember
                ? "No replacement is required because no other eligible active household member exists. Both records will be archived together in one protected transaction."
                : "No eligible household member is available to become the new household head."}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="replacement-household-head">
              New household head
            </Label>
            <select
              id="replacement-household-head"
              value={replacementId}
              onChange={(event) => setReplacementId(event.target.value)}
              disabled={mutation.isPending}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Select an eligible household member</option>
              {eligibleMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {formatPersonName(member)} · {member.resident_number}
                </option>
              ))}
            </select>
          </div>
        )}

        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {archiveMutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{archiveMutation.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          {canResolveSoleMember ? (
            <Button
              type="button"
              variant="destructive"
              onClick={archiveSoleMemberHousehold}
              disabled={pending}
            >
              {archiveMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <UserRoundCog />
              )}
              {archiveMutation.isPending
                ? "Archiving…"
                : "Archive Resident and Household"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={save}
              disabled={
                pending ||
                members.isLoading ||
                members.isError ||
                !replacementId
              }
            >
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <UserRoundCog />
              )}
              {mutation.isPending
                ? "Saving…"
                : continueToArchive
                  ? "Change head and continue"
                  : "Change household head"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
