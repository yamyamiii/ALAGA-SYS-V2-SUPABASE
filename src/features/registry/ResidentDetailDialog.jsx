import { Archive, Home, Link2, Pencil, RotateCcw } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResidentAppointmentHistory } from "@/features/appointments/ResidentAppointmentHistory";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PREGNANCY_STATUS_LABELS,
  RESIDENT_STATUS_LABELS,
  SEX_LABELS,
} from "@/features/registry/constants";
import {
  calculateAge,
  formatDate,
  formatPersonName,
  titleCaseStatus,
} from "@/features/registry/formatters";
import { useResident } from "@/features/registry/hooks";
import { ResidentPhoto } from "@/features/registry/ResidentPhoto";

function Value({ label, children, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium">{children || "Not provided"}</dd>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-heading text-base font-semibold">{title}</h3>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

function residentDetailErrorTitle(error) {
  if (error?.code === "resident_not_found") return "Resident not found";
  if (error?.code === "permission_denied") return "Access denied";
  if (error?.code === "invalid_resident_id")
    return "Invalid resident reference";
  return "Resident unavailable";
}

export function ResidentDetailDialog({
  residentId,
  open,
  onOpenChange,
  canManage,
  canRestore,
  canLinkAccount = false,
  onEdit,
  onArchive,
  onHousehold,
  onAccount,
}) {
  const resident = useResident(residentId, open);
  const record = resident.data;
  const archived = Boolean(record?.archived_at);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resident details</DialogTitle>
          <DialogDescription>
            Demographic and household information authorized by registry policy.
          </DialogDescription>
        </DialogHeader>

        {resident.isLoading ? (
          <LoadingState
            compact
            title="Loading resident"
            description="Retrieving the RLS-authorized resident record…"
          />
        ) : resident.isError ? (
          <ErrorState
            compact
            title={residentDetailErrorTitle(resident.error)}
            description={resident.error.message}
            actionLabel="Try again"
            onAction={() => resident.refetch()}
          />
        ) : record ? (
          <div className="space-y-4">
            {archived ? (
              <Alert>
                <Archive className="h-4 w-4" />
                <AlertDescription>
                  This resident is archived and excluded from current registry
                  lists. The record remains available for authorized review.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-3 rounded-xl bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <ResidentPhoto resident={record} />
                <div>
                  <p className="font-heading text-xl font-semibold">
                    {formatPersonName(record)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.resident_number}
                  </p>
                </div>
              </div>
              <Badge variant={archived ? "secondary" : "success"}>
                {RESIDENT_STATUS_LABELS[record.status] ?? record.status}
              </Badge>
            </div>

            <DetailSection title="1. Personal Information">
              <Value label="First name">{record.first_name}</Value>
              <Value label="Middle name">{record.middle_name}</Value>
              <Value label="Last name">{record.last_name}</Value>
              <Value label="Suffix">{record.suffix}</Value>
              <Value label="Date of birth">
                {formatDate(record.date_of_birth)}
              </Value>
              <Value label="Calculated age">
                {calculateAge(record.date_of_birth) ?? "Not available"}
              </Value>
              <Value label="Sex">{SEX_LABELS[record.sex]}</Value>
              <Value label="Civil status">
                {titleCaseStatus(record.civil_status)}
              </Value>
              <Value label="Blood type">{record.blood_type}</Value>
              <Value label="Nationality">{record.nationality}</Value>
              <Value label="Religion">{record.religion}</Value>
              <Value label="Occupation">{record.occupation}</Value>
            </DetailSection>

            <DetailSection title="2. Contact Information">
              <Value label="Phone number">{record.phone_number}</Value>
              <Value label="Email">{record.email}</Value>
              <Value label="Address" wide>
                {record.address_line}
              </Value>
              <Value label="PhilHealth number">
                {record.philhealth_number}
              </Value>
            </DetailSection>

            <DetailSection title="3. Household Information">
              <Value label="Household number">
                {record.household?.household_number}
              </Value>
              <Value label="Barangay">{record.barangay?.name}</Value>
              <Value label="Purok">{record.purok?.name}</Value>
              <Value label="Household address" wide>
                {record.household?.address_line}
              </Value>
            </DetailSection>

            <DetailSection title="4. Emergency Contact">
              <Value label="Name">{record.emergency_contact_name}</Value>
              <Value label="Phone number">
                {record.emergency_contact_number}
              </Value>
              <Value label="Relationship">
                {record.emergency_contact_relationship}
              </Value>
            </DetailSection>

            <DetailSection title="5. Classification">
              <Value label="Senior citizen">
                {record.is_senior_citizen ? "Yes" : "No"}
              </Value>
              <Value label="PWD">{record.is_pwd ? "Yes" : "No"}</Value>
              {record.sex === "female" ? (
                <Value label="Pregnancy status">
                  {PREGNANCY_STATUS_LABELS[record.pregnancy_status]}
                </Value>
              ) : null}
              <Value label="Registry status">
                {RESIDENT_STATUS_LABELS[record.status] ?? record.status}
              </Value>
            </DetailSection>

            <DetailSection title="6. Administrative Metadata">
              <Value label="Created">
                {formatDate(record.created_at, true)}
              </Value>
              <Value label="Last updated">
                {formatDate(record.updated_at, true)}
              </Value>
              <Value label="Archived">
                {record.archived_at
                  ? formatDate(record.archived_at, true)
                  : "No"}
              </Value>
              <Value label="Linked portal profile">
                {record.linked_profile_id ? "Linked" : "Not linked"}
              </Value>
            </DetailSection>

            <ResidentAppointmentHistory residentId={record.id} />

            {canManage ? (
              <div className="flex flex-wrap gap-2 border-t pt-5">
                {!archived ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onEdit(record)}
                    >
                      <Pencil /> Edit resident
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onHousehold(record)}
                    >
                      <Home /> Household assignment
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => onArchive(record, false)}
                    >
                      <Archive /> Archive
                    </Button>
                  </>
                ) : canRestore ? (
                  <Button type="button" onClick={() => onArchive(record, true)}>
                    <RotateCcw /> Restore
                  </Button>
                ) : null}
              </div>
            ) : null}
            {canLinkAccount ? (
              <div className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onAccount(record)}
                >
                  <Link2 /> Manage portal account
                </Button>
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
  );
}
