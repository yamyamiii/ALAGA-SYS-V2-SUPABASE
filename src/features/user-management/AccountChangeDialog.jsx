import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
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
import { getRoleLabel, USER_ROLES } from "@/features/auth/permissions";
import { STATUS_TRANSITIONS } from "@/features/user-management/schemas";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { userManagementService } from "@/services/userManagementService";

const statusLabels = {
  invited: "Invited",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
};

export function AccountChangeDialog({
  type,
  user,
  currentUserId,
  open,
  onOpenChange,
  onSuccess,
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const roleChange = type === "role";
  const isSelf = Boolean(user?.id && user.id === currentUserId);
  const isAdministratorTarget = user?.role === USER_ROLES.ADMINISTRATOR;
  const options = useMemo(
    () =>
      roleChange
        ? Object.values(USER_ROLES).filter((role) => role !== user?.role)
        : (STATUS_TRANSITIONS[user?.account_status] ?? []),
    [roleChange, user?.account_status, user?.role],
  );

  useDialogDraftLifecycle({
    open,
    draftKey: `${user?.id ?? "none"}:${type}`,
    resetDraft: () => {
      setValue(options[0] ?? "");
      setError(null);
    },
  });

  async function confirm() {
    if (!value || !user) return;
    setSubmitting(true);
    setError(null);
    try {
      if (roleChange) await userManagementService.updateRole(user.id, value);
      else await userManagementService.updateAccountStatus(user.id, value);
      toast.success(roleChange ? "Role changed" : "Account status changed");
      onOpenChange(false);
      onSuccess();
    } catch (requestError) {
      setError(requestError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {roleChange ? "Change account role" : "Change account status"}
          </DialogTitle>
          <DialogDescription>
            This sensitive change is validated and audited by the trusted server
            workflow.
          </DialogDescription>
        </DialogHeader>
        {isSelf ? (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              You cannot change your own role or account status here.
            </AlertDescription>
          </Alert>
        ) : isAdministratorTarget ? (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Administrator changes are server-validated. The final active
              administrator cannot be demoted, deactivated, or suspended.
            </AlertDescription>
          </Alert>
        ) : !roleChange ? (
          <p className="text-sm leading-6 text-muted-foreground">
            Changing status updates this account&apos;s access. Existing records
            and retained history are not deleted.
          </p>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="account-change-value">
            New {roleChange ? "role" : "status"}
          </Label>
          <select
            id="account-change-value"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {roleChange ? getRoleLabel(option) : statusLabels[option]}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={roleChange ? "default" : "destructive"}
            onClick={confirm}
            disabled={submitting || !value}
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <ShieldAlert />
            )}
            {submitting ? "Saving…" : "Confirm change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
