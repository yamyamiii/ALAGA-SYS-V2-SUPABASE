import { Archive, FileCheck2, FileText, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
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
import { useAuth } from "@/features/auth/authContext";
import { DocumentPreviewDialog } from "@/features/documents/DocumentPreviewDialog";
import { DOCUMENT_TYPES } from "@/features/documents/constants";
import {
  useDocumentMutation,
  useReferralForEncounter,
} from "@/features/documents/hooks";
import { canCreateReferral } from "@/features/documents/permissions";
import {
  EMPTY_REFERRAL,
  validateReferral,
} from "@/features/documents/referralSchema";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { documentService } from "@/services/documentService";

function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
  rows = 4,
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        {error ? (
          <span id={`${id}-error`} role="alert" className="text-destructive">
            {error}
          </span>
        ) : (
          <span />
        )}
        <span>
          {value.length.toLocaleString()}/{maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function ReferralDialog({ encounter, open, onOpenChange }) {
  const { profile } = useAuth();
  const query = useReferralForEncounter(encounter?.id, open);
  const [values, setValues] = useState(EMPTY_REFERRAL);
  const [errors, setErrors] = useState({});
  const [confirmAction, setConfirmAction] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const referral = query.data;
  const canCreate = canCreateReferral(profile.role, encounter, profile.id);
  const canEdit =
    canCreate &&
    (!referral ||
      (referral.status === "draft" &&
        referral.referring_staff_id === profile.id));
  const hasUnsavedChanges =
    referral?.status === "draft" &&
    (values.receiving_facility !== (referral.receiving_facility ?? "") ||
      values.reason_for_referral !== (referral.reason_for_referral ?? "") ||
      values.clinical_summary !== (referral.clinical_summary ?? ""));
  const saveMutation = useDocumentMutation(({ current, draft }) =>
    documentService.saveReferral(encounter.id, draft, current),
  );
  const finalizeMutation = useDocumentMutation((current) =>
    documentService.finalizeReferral(current),
  );
  const archiveMutation = useDocumentMutation((current) =>
    documentService.archiveReferral(current),
  );

  const resetDraft = () => {
    setValues(
      referral
        ? {
            receiving_facility: referral.receiving_facility ?? "",
            reason_for_referral: referral.reason_for_referral ?? "",
            clinical_summary: referral.clinical_summary ?? "",
          }
        : EMPTY_REFERRAL,
    );
    setErrors({});
    setConfirmAction(null);
    setPreviewOpen(false);
  };
  useDialogDraftLifecycle({
    open,
    draftKey: `${encounter?.id ?? "none"}:${referral?.id ?? "new"}`,
    resetDraft,
  });

  const save = async () => {
    const result = validateReferral(values);
    setErrors(result.errors);
    if (!result.data) return;
    try {
      await saveMutation.mutateAsync({ current: referral, draft: result.data });
      toast.success(
        referral ? "Referral draft updated." : "Referral draft created.",
      );
      await query.refetch();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const completeConfirmedAction = async () => {
    try {
      if (confirmAction === "finalize") {
        await finalizeMutation.mutateAsync(referral);
        toast.success("Referral finalized. It is now read-only.");
      } else {
        await archiveMutation.mutateAsync(referral);
        toast.success("Referral archived.");
      }
      setConfirmAction(null);
      await query.refetch();
      if (confirmAction === "archive") onOpenChange(false);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const pending =
    saveMutation.isPending ||
    finalizeMutation.isPending ||
    archiveMutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Referral form</DialogTitle>
            <DialogDescription>
              Clinician-authored referral content linked to this signed
              encounter. No AI-generated clinical content is used.
            </DialogDescription>
          </DialogHeader>
          {query.isLoading ? (
            <LoadingState compact title="Checking referral access" />
          ) : query.isError ? (
            <ErrorState
              compact
              title="Referral unavailable"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : !referral && !canCreate ? (
            <EmptyState
              compact
              title="No completed referral"
              description="No finalized referral document is available for this encounter."
            />
          ) : (
            <div className="space-y-5">
              {referral ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                  <div>
                    <p className="font-semibold">{referral.referral_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {referral.referring_staff_name}
                    </p>
                  </div>
                  <Badge variant="outline">{referral.status}</Badge>
                </div>
              ) : null}

              {canEdit ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="referral-facility">
                      Receiving facility
                    </Label>
                    <Input
                      id="referral-facility"
                      value={values.receiving_facility}
                      maxLength={500}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          receiving_facility: event.target.value,
                        }))
                      }
                      aria-invalid={Boolean(errors.receiving_facility)}
                      aria-describedby={
                        errors.receiving_facility
                          ? "referral-facility-error"
                          : undefined
                      }
                    />
                    {errors.receiving_facility ? (
                      <p
                        id="referral-facility-error"
                        role="alert"
                        className="text-xs text-destructive"
                      >
                        {errors.receiving_facility}
                      </p>
                    ) : null}
                  </div>
                  <TextAreaField
                    id="referral-reason"
                    label="Reason for referral"
                    value={values.reason_for_referral}
                    maxLength={2_000}
                    error={errors.reason_for_referral}
                    onChange={(value) =>
                      setValues((current) => ({
                        ...current,
                        reason_for_referral: value,
                      }))
                    }
                  />
                  <TextAreaField
                    id="referral-summary"
                    label="Concise relevant clinical summary"
                    value={values.clinical_summary}
                    maxLength={5_000}
                    rows={6}
                    error={errors.clinical_summary}
                    onChange={(value) =>
                      setValues((current) => ({
                        ...current,
                        clinical_summary: value,
                      }))
                    }
                  />
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Review all content before finalizing. Finalized referrals
                    are immutable and become available only through the
                    authorized document workflow.
                  </p>
                  {hasUnsavedChanges ? (
                    <p
                      id="referral-unsaved-changes"
                      className="text-xs font-medium text-amber-800"
                    >
                      Save the current changes before finalizing this referral.
                    </p>
                  ) : null}
                </div>
              ) : referral ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Receiving facility
                    </dt>
                    <dd className="mt-1 text-sm">
                      {referral.receiving_facility}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">
                      Referral date
                    </dt>
                    <dd className="mt-1 text-sm">{referral.referral_date}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {canEdit ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={save}
              >
                <Save /> Save draft
              </Button>
            ) : null}
            {referral?.status === "draft" && canEdit ? (
              <Button
                type="button"
                disabled={pending || hasUnsavedChanges}
                aria-describedby={
                  hasUnsavedChanges ? "referral-unsaved-changes" : undefined
                }
                onClick={() => setConfirmAction("finalize")}
              >
                <FileCheck2 /> Finalize
              </Button>
            ) : null}
            {referral?.status === "finalized" ? (
              <Button type="button" onClick={() => setPreviewOpen(true)}>
                <FileText /> Preview and print
              </Button>
            ) : null}
            {referral?.status === "finalized" &&
            referral.referring_staff_id === profile.id ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => setConfirmAction("archive")}
              >
                <Archive /> Archive
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(next) => !next && setConfirmAction(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "finalize"
                ? "Finalize referral?"
                : "Archive referral?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "finalize"
                ? "Finalized referral content cannot be edited. Confirm that the receiving facility, reason, and clinical summary are accurate."
                : "The referral will no longer be available for routine viewing or printing."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmAction === "archive" ? "destructive" : "default"}
              disabled={pending}
              onClick={completeConfirmedAction}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewOpen ? (
        <DocumentPreviewDialog
          documentType={DOCUMENT_TYPES.REFERRAL_FORM}
          recordId={referral?.id}
          open
          onOpenChange={setPreviewOpen}
        />
      ) : null}
    </>
  );
}
