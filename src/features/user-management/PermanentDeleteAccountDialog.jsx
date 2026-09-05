import { LoaderCircle, Trash2 } from "lucide-react";
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

export function PermanentDeleteAccountDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}) {
  const removesResidentRecord = account?.permanent_delete_kind === "resident";
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setConfirmation("");
      setError(null);
    }
  }, [open, account?.id]);

  async function deleteAccount() {
    if (!account || confirmation !== "DELETE") return;
    setSubmitting(true);
    setError(null);
    try {
      await userManagementService.deleteAccountPermanently(
        account.id,
        account.registration_version,
      );
      toast.success("Account permanently deleted");
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
          <DialogTitle>
            {removesResidentRecord
              ? "Permanently delete Resident account?"
              : "Permanently delete account?"}
          </DialogTitle>
          <DialogDescription>
            {removesResidentRecord
              ? "This permanently removes the Resident login and Resident record only if the server confirms no protected history exists. This action cannot be undone."
              : "This permanently removes the user's login account if the server confirms that no protected system history depends on it. This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="permanent-delete-confirmation">
            Type DELETE to confirm
          </Label>
          <Input
            id="permanent-delete-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            disabled={submitting}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            The server rechecks appointments, clinical information, documents,
            audit authorship, inquiries, notification jobs, and every other
            protected dependency before deleting anything.
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
            onClick={deleteAccount}
            disabled={submitting || confirmation !== "DELETE"}
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Trash2 />
            )}
            {submitting ? "Deleting…" : "Delete account permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
