import {
  Archive,
  LoaderCircle,
  Pencil,
  RotateCcw,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HouseholdMemberDialog } from "@/features/registry/HouseholdMemberDialog";
import { formatDate, formatPersonName } from "@/features/registry/formatters";
import {
  useHousehold,
  useHouseholdMembers,
  useRegistryMutation,
} from "@/features/registry/hooks";
import { registryService } from "@/services/registryService";

export function HouseholdDetailDialog({
  householdId,
  open,
  onOpenChange,
  canManage,
  canRestore,
  onEdit,
  onArchive,
  onChanged,
}) {
  const household = useHousehold(householdId, open);
  const members = useHouseholdMembers(householdId, open);
  const [headId, setHeadId] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const headMutation = useRegistryMutation(() =>
    registryService.setHouseholdHead(householdId, headId),
  );
  const removeMutation = useRegistryMutation((residentId) =>
    registryService.removeResidentFromHousehold(residentId),
  );

  useEffect(() => {
    setHeadId(household.data?.head_resident_id ?? "");
  }, [household.data?.head_resident_id]);

  async function saveHead() {
    setActionError(null);
    try {
      await headMutation.mutateAsync();
      toast.success("Household head updated");
      await Promise.all([household.refetch(), members.refetch()]);
      onChanged?.();
    } catch (error) {
      setActionError(error);
    }
  }

  async function removeMember(resident) {
    setActionError(null);
    try {
      await removeMutation.mutateAsync(resident.id);
      toast.success("Resident removed from household");
      await Promise.all([household.refetch(), members.refetch()]);
      onChanged?.();
    } catch (error) {
      setActionError(error);
    }
  }

  const record = household.data;
  const archived = Boolean(record?.archived_at);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Household details</DialogTitle>
            <DialogDescription>
              Locality, household head, and current member relationships.
            </DialogDescription>
          </DialogHeader>
          {household.isLoading ? (
            <LoadingState
              compact
              title="Loading household"
              description="Retrieving the RLS-authorized household record…"
            />
          ) : household.isError ? (
            <ErrorState
              compact
              title="Household unavailable"
              description={household.error.message}
              actionLabel="Try again"
              onAction={() => household.refetch()}
            />
          ) : record ? (
            <div className="space-y-6">
              {archived ? (
                <Alert>
                  <Archive className="h-4 w-4" />
                  <AlertDescription>
                    This household is archived and is excluded from normal
                    registry lists.
                  </AlertDescription>
                </Alert>
              ) : null}
              {actionError ? (
                <Alert variant="destructive">
                  <AlertDescription>{actionError.message}</AlertDescription>
                </Alert>
              ) : null}
              <section className="rounded-xl border bg-muted/25 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-xl font-semibold">
                      {record.household_number}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {record.address_line}
                    </p>
                  </div>
                  <Badge variant={archived ? "secondary" : "success"}>
                    {record.status}
                  </Badge>
                </div>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Barangay</dt>
                    <dd className="mt-1 font-medium">
                      {record.barangay?.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Purok</dt>
                    <dd className="mt-1 font-medium">{record.purok?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="mt-1 font-medium">
                      {formatDate(record.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="mt-1 font-medium">
                      {formatDate(record.updated_at, true)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Archived</dt>
                    <dd className="mt-1 font-medium">
                      {record.archived_at
                        ? formatDate(record.archived_at, true)
                        : "No"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-heading text-base font-semibold">
                      Household head
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      The head must be a current member.
                    </p>
                  </div>
                  {canManage && !archived ? (
                    <div className="flex w-full gap-2 sm:w-auto">
                      <select
                        value={headId}
                        onChange={(event) => setHeadId(event.target.value)}
                        aria-label="Household head"
                        className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-w-52"
                      >
                        <option value="">No household head</option>
                        {(members.data ?? []).map((member) => (
                          <option key={member.id} value={member.id}>
                            {formatPersonName(member)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={saveHead}
                        disabled={headMutation.isPending}
                      >
                        {headMutation.isPending ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium">
                      {formatPersonName(
                        (members.data ?? []).find(
                          (member) => member.id === record.head_resident_id,
                        ),
                      )}
                    </p>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-base font-semibold">
                      Current members
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {members.data?.length ?? 0} member(s)
                    </p>
                  </div>
                  {canManage && !archived ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setMemberOpen(true)}
                    >
                      <UserPlus /> Add existing
                    </Button>
                  ) : null}
                </div>
                {members.isLoading ? (
                  <LoadingState compact title="Loading members" />
                ) : members.isError ? (
                  <ErrorState
                    compact
                    title="Members unavailable"
                    description={members.error.message}
                  />
                ) : members.data?.length ? (
                  <div className="divide-y rounded-xl border">
                    {members.data.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {formatPersonName(member)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {member.resident_number}
                            {member.id === record.head_resident_id
                              ? " • Household head"
                              : ""}
                          </p>
                        </div>
                        {canManage && !archived ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${formatPersonName(member)} from household`}
                            onClick={() => removeMember(member)}
                            disabled={removeMutation.isPending}
                          >
                            <UserMinus />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No current household members.
                  </p>
                )}
              </section>

              {canManage ? (
                <div className="flex flex-wrap gap-2 border-t pt-5">
                  {!archived ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onEdit(record)}
                    >
                      <Pencil /> Edit household
                    </Button>
                  ) : null}
                  {!archived ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => onArchive(record, false)}
                    >
                      <Archive /> Archive
                    </Button>
                  ) : canRestore ? (
                    <Button
                      type="button"
                      onClick={() => onArchive(record, true)}
                    >
                      <RotateCcw /> Restore
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {record ? (
        <HouseholdMemberDialog
          open={memberOpen}
          onOpenChange={setMemberOpen}
          household={record}
          onSaved={async () => {
            await Promise.all([household.refetch(), members.refetch()]);
            onChanged?.();
          }}
        />
      ) : null}
    </>
  );
}
