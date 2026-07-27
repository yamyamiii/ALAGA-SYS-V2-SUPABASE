import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, LoaderCircle, MailPlus, Search, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPersonName } from "@/features/registry/formatters";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { userManagementService } from "@/services/userManagementService";

function accountName(account) {
  return formatPersonName(account) || account?.email || "Resident account";
}

export function ResidentAccountDialog({ open, onOpenChange, resident }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const residentId = resident?.id;
  const archived = Boolean(resident?.archived_at);
  const accountQuery = useQuery({
    queryKey: ["resident-account", residentId],
    queryFn: () => userManagementService.getResidentAccount(residentId),
    enabled: open && Boolean(residentId),
  });
  const candidates = useQuery({
    queryKey: ["resident-account-candidates", debouncedSearch],
    queryFn: () =>
      userManagementService.listResidentLinkCandidates({
        search: debouncedSearch,
        page: 1,
        page_size: 20,
      }),
    enabled:
      open && Boolean(residentId) && accountQuery.data === null && !archived,
  });

  const mutation = useMutation({
    mutationFn: async ({ action, profileId }) => {
      if (action === "link") {
        return userManagementService.linkResidentAccount(residentId, profileId);
      }
      if (action === "unlink") {
        return userManagementService.unlinkResidentAccount(residentId);
      }
      return userManagementService.inviteResidentAccount(residentId, {
        email,
        first_name: resident.first_name,
        middle_name: resident.middle_name,
        last_name: resident.last_name,
        suffix: resident.suffix,
        phone_number: resident.phone_number,
      });
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["resident-account", residentId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["resident-account-candidates"],
        }),
        queryClient.invalidateQueries({ queryKey: ["registry"] }),
      ]);
      setConfirmUnlink(false);
      toast.success(
        variables.action === "unlink"
          ? "Resident account unlinked"
          : variables.action === "invite"
            ? "Invitation sent and account linked"
            : "Resident account linked",
      );
    },
  });

  useDialogDraftLifecycle({
    open,
    draftKey: resident?.id ?? "none",
    resetDraft: () => {
      setEmail(resident?.email ?? "");
      setSearch("");
      setConfirmUnlink(false);
      mutation.reset();
    },
  });

  const account = accountQuery.data;
  const pending = mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resident portal account</DialogTitle>
          <DialogDescription>
            Administrator-only linking for{" "}
            {resident ? formatPersonName(resident) : "this resident"}. Portal
            accounts are never deleted by unlinking.
          </DialogDescription>
        </DialogHeader>
        {mutation.error ? (
          <Alert variant="destructive">
            <AlertDescription>{mutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {accountQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading account status…
          </p>
        ) : accountQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{accountQuery.error.message}</AlertDescription>
          </Alert>
        ) : account ? (
          <div className="space-y-4 rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{accountName(account)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {account.email}
                </p>
              </div>
              <Badge
                variant={
                  account.account_status === "active" ? "success" : "warning"
                }
              >
                {account.account_status}
              </Badge>
            </div>
            {confirmUnlink ? (
              <Alert>
                <AlertDescription className="space-y-3">
                  <p>
                    Unlink this portal account? The Auth user and profile will
                    remain intact.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmUnlink(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => mutation.mutate({ action: "unlink" })}
                      disabled={pending}
                    >
                      Confirm unlink
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmUnlink(true)}
              >
                <Unlink /> Unlink account
              </Button>
            )}
          </div>
        ) : archived ? (
          <Alert>
            <AlertDescription>
              This archived resident has no linked portal account. Restore the
              resident before creating or linking one.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3">
              <div>
                <h3 className="font-semibold">
                  Link an existing resident account
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only active or invited, unlinked resident-role profiles are
                  returned.
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search account name or email"
                  className="pl-9"
                />
              </div>
              {candidates.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Searching accounts…
                </p>
              ) : candidates.isError ? (
                <p className="text-xs text-destructive">
                  {candidates.error.message}
                </p>
              ) : (candidates.data?.items ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No eligible existing account matches.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {candidates.data.items.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() =>
                        mutation.mutate({
                          action: "link",
                          profileId: candidate.id,
                        })
                      }
                      disabled={pending}
                      className="flex w-full items-center justify-between gap-3 rounded-md p-2 text-left hover:bg-accent disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {accountName(candidate)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {candidate.email}
                        </span>
                      </span>
                      <Badge variant="outline">
                        {candidate.account_status}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="space-y-3 border-t pt-5">
              <div>
                <h3 className="font-semibold">Create by invitation</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The new Auth account is forced to the Resident role and linked
                  after profile creation succeeds.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resident-account-email">Email</Label>
                <Input
                  id="resident-account-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={() => mutation.mutate({ action: "invite" })}
                disabled={pending || !email.trim()}
              >
                {pending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <MailPlus />
                )}
                Send invitation and link
              </Button>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Close
          </Button>
          {pending ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="h-4 w-4" />
              Saving trusted account change…
            </span>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
