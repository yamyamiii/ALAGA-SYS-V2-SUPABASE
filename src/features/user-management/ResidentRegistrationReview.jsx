import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, SearchCheck, UserRoundX } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { userManagementService } from "@/services/userManagementService";

function displayName(value) {
  return [value.first_name, value.middle_name, value.last_name]
    .filter(Boolean)
    .join(" ");
}

function displayDate(value, pattern = "MMM d, yyyy") {
  return value ? format(new Date(value), pattern) : "Not provided";
}

function ReviewDialog({ registration, open, onOpenChange, onChanged }) {
  const [selectedResidentId, setSelectedResidentId] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const matches = registration?.possible_matches ?? [];

  useEffect(() => {
    setSelectedResidentId("");
    setConfirmReject(false);
  }, [registration?.id, open]);

  async function approve() {
    setBusyAction("approve");
    try {
      const result = await userManagementService.approveResidentRegistration(
        registration.id,
        registration.version,
        selectedResidentId || null,
      );
      toast.success(
        result.resident?.linked_existing
          ? "Resident account linked and approved"
          : `Resident account approved${result.resident?.resident_number ? ` as ${result.resident.resident_number}` : ""}`,
      );
      onOpenChange(false);
      await onChanged();
    } catch (error) {
      toast.error("Registration could not be approved", {
        description: error.message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function reject() {
    setBusyAction("reject");
    try {
      await userManagementService.rejectResidentRegistration(
        registration.id,
        registration.version,
      );
      toast.success("Resident registration rejected");
      onOpenChange(false);
      await onChanged();
    } catch (error) {
      toast.error("Registration could not be rejected", {
        description: error.message,
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (!registration) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Resident registration</DialogTitle>
          <DialogDescription>
            Verify the submitted identity. Exact existing matches require an
            explicit link and are never merged automatically.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-4 rounded-xl border bg-muted/25 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="mt-1 font-medium">{displayName(registration)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="mt-1 break-all font-medium">{registration.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Date of birth</dt>
            <dd className="mt-1">{displayDate(registration.date_of_birth)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Sex</dt>
            <dd className="mt-1 capitalize">{registration.sex}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Locality</dt>
            <dd className="mt-1">
              Brgy. Bagongpook · {registration.purok_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Phone</dt>
            <dd className="mt-1">
              {registration.phone_number || "Not provided"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Address</dt>
            <dd className="mt-1">
              {registration.address_line || "Not provided"}
            </dd>
          </div>
        </dl>

        {matches.length ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <SearchCheck className="h-4 w-4 text-amber-600" />
              <h3 className="font-semibold">
                Possible existing Resident match
              </h3>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Select the verified matching record. Unavailable or archived
              records must be resolved through the Resident registry first.
            </p>
            <div className="space-y-2">
              {matches.map((candidate) => {
                const eligible =
                  candidate.status === "active" &&
                  !candidate.archived_at &&
                  !candidate.linked_profile_id;
                return (
                  <label
                    key={candidate.id}
                    className="flex min-h-11 items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <input
                      type="radio"
                      name="resident-registration-match"
                      value={candidate.id}
                      checked={selectedResidentId === candidate.id}
                      onChange={(event) =>
                        setSelectedResidentId(event.target.value)
                      }
                      disabled={!eligible || Boolean(busyAction)}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">
                        {candidate.resident_number} · {displayName(candidate)}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {candidate.purok_name} · {candidate.status}
                        {candidate.linked_profile_id
                          ? " · account already linked"
                          : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            No exact name and birth-date match was found. Approval will create
            one active Resident record and generate its RES number server-side.
          </p>
        )}

        {confirmReject ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="font-medium">Reject this registration?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The account will remain unable to access ALAGA-SYS Resident
              services. The decision remains in the audit history.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={Boolean(busyAction)}
          >
            Cancel
          </Button>
          {confirmReject ? (
            <Button
              type="button"
              variant="destructive"
              onClick={reject}
              disabled={Boolean(busyAction)}
            >
              <UserRoundX />
              {busyAction === "reject" ? "Rejecting…" : "Reject registration"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmReject(true)}
              disabled={Boolean(busyAction)}
            >
              Reject
            </Button>
          )}
          <Button
            type="button"
            onClick={approve}
            disabled={
              Boolean(busyAction) || (matches.length > 0 && !selectedResidentId)
            }
          >
            <Check />
            {busyAction === "approve"
              ? "Approving…"
              : matches.length
                ? "Approve and link"
                : "Approve and create Resident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResidentRegistrationReview() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const query = useQuery({
    queryKey: ["resident-registration-requests", "pending"],
    queryFn: () =>
      userManagementService.listResidentRegistrations({
        page: 1,
        page_size: 50,
        status: "pending",
      }),
  });
  const registrations = query.data?.items ?? [];

  async function changed() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["resident-registration-requests"],
      }),
      queryClient.invalidateQueries({ queryKey: ["managed-users"] }),
      queryClient.invalidateQueries({ queryKey: ["residents"] }),
    ]);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Pending Resident registrations</CardTitle>
              <CardDescription className="mt-2">
                Administrator verification is required before Resident access is
                activated.
              </CardDescription>
            </div>
            <Badge variant={registrations.length ? "warning" : "secondary"}>
              {query.isLoading
                ? "Loading"
                : `${query.data?.total ?? 0} pending`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <div className="rounded-lg border border-destructive/40 p-4 text-sm">
              <p>{query.error.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => query.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : query.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading pending registrations…
            </p>
          ) : registrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no Resident registrations awaiting review.
            </p>
          ) : (
            <div className="space-y-3">
              {registrations.map((registration) => (
                <div
                  key={registration.id}
                  className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{displayName(registration)}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {registration.email} · {registration.purok_name} ·
                      submitted {displayDate(registration.submitted_at)}
                    </p>
                    {registration.possible_matches?.length ? (
                      <Badge variant="warning" className="mt-2">
                        Possible existing match
                      </Badge>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelected(registration)}
                  >
                    Review
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ReviewDialog
        registration={selected}
        open={Boolean(selected)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelected(null);
        }}
        onChanged={changed}
      />
    </>
  );
}
