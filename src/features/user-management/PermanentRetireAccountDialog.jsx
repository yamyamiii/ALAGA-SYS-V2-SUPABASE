import { LoaderCircle, UserX } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userManagementService } from "@/services/userManagementService";

export function PermanentRetireAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setConfirmation("");
      setError(null);
    }
  }, [open, account?.id]);

  async function retireAccount() {
    if (!account || confirmation !== "REMOVE") return;
    setSubmitting(true);
    setError(null);
    try {
      await userManagementService.retireAccountPermanently(account.id);
      toast.success("Account access permanently removed");
      onOpenChange(false);
      await onSuccess?.();
    } catch (serviceError) {
      setError(serviceError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remove account access permanently?</DialogTitle>
          <DialogDescription>
            This account has historical records that must be retained. The
            user&apos;s login access will be permanently removed and the account
            will no longer appear in active User Management. Historical records
            will remain for data integrity and audit history.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="permanent-retirement-confirmation">
            Type REMOVE to confirm
          </Label>
          <Input
            id="permanent-retirement-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={submitting}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            The historical profile identity and protected records remain. The
            original email address is released only after the trusted Auth
            retirement succeeds.
          </p>
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
            variant="destructive"
            onClick={retireAccount}
            disabled={submitting || confirmation !== "REMOVE"}
          >
            {submitting ? <LoaderCircle className="animate-spin" /> : <UserX />}
            {submitting
              ? "Removing access…"
              : "Remove account access permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
