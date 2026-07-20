import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  open,
  onOpenChange,
  onSuccess,
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const roleChange = type === "role";
  const options = useMemo(
    () =>
      roleChange
        ? Object.values(USER_ROLES).filter((role) => role !== user?.role)
        : (STATUS_TRANSITIONS[user?.account_status] ?? []),
    [roleChange, user?.account_status, user?.role],
  );

  useEffect(() => {
    if (open) {
      setValue(options[0] ?? "");
      setError(null);
    }
  }, [open, options, user?.id, type]);

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
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            You cannot change your own role or status, or remove the final
            active administrator.
          </AlertDescription>
        </Alert>
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
