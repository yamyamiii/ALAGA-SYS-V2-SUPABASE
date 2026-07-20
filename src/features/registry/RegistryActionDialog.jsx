import { Archive, LoaderCircle, RotateCcw } from "lucide-react";

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

export function RegistryActionDialog({
  open,
  onOpenChange,
  kind,
  recordLabel,
  restoring = false,
  pending = false,
  error,
  onConfirm,
}) {
  const action = restoring ? "restore" : "archive";
  const Icon = restoring ? RotateCcw : Archive;

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {restoring ? "Restore" : "Archive"} {kind}?
          </DialogTitle>
          <DialogDescription>
            {restoring
              ? "The record will return to current registry lists."
              : "The record will leave normal active lists but remain available to authorized administrators and audit history."}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border bg-muted/30 p-4 text-sm font-medium">
          {recordLabel}
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
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
          <Button
            type="button"
            variant={restoring ? "default" : "destructive"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : <Icon />}
            {pending
              ? "Saving…"
              : `${action[0].toUpperCase()}${action.slice(1)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
