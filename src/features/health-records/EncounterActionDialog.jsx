import { useState } from "react";
import { toast } from "sonner";

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
import { useHealthRecordMutation } from "@/features/health-records/hooks";
import { amendmentSchema } from "@/features/health-records/schemas";
import { healthRecordService } from "@/services/healthRecordService";

const copy = {
  sign: {
    title: "Sign clinical encounter",
    description:
      "Signing makes this record read-only. Future corrections require an amendment.",
    action: "Sign encounter",
  },
  amend: {
    title: "Create amendment",
    description:
      "A new draft will preserve the original signed record and copy its clinical content for correction.",
    action: "Create amendment",
  },
  archive: {
    title: "Archive health record",
    description:
      "The signed record remains preserved for authorized administrative access.",
    action: "Archive record",
  },
};

export function EncounterActionDialog({
  action,
  encounter,
  open,
  onOpenChange,
  onCompleted,
}) {
  const [reason, setReason] = useState("");
  const mutation = useHealthRecordMutation(async () => {
    if (action === "sign") return healthRecordService.sign(encounter);
    if (action === "amend") {
      const parsed = amendmentSchema.parse({ amendment_reason: reason });
      return healthRecordService.amend(encounter, parsed.amendment_reason);
    }
    return healthRecordService.archive(encounter);
  });
  const content = copy[action] ?? copy.sign;

  async function submit(event) {
    event.preventDefault();
    try {
      const result = await mutation.mutateAsync();
      toast.success(
        action === "amend"
          ? `Created amendment ${result.encounter_number}.`
          : `${encounter.encounter_number} updated.`,
      );
      setReason("");
      onOpenChange(false);
      onCompleted?.(result);
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{content.title}</DialogTitle>
          <DialogDescription>{content.description}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {action === "amend" ? (
            <div className="space-y-2">
              <Label htmlFor="amendment-reason">Amendment reason</Label>
              <textarea
                id="amendment-reason"
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                maxLength={1000}
                required
                disabled={mutation.isPending}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={action === "archive" ? "destructive" : "default"}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Working…" : content.action}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
