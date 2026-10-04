import { Eye } from "lucide-react";
import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";

import { ContentContainer } from "@/components/common/ContentContainer";
import { PageHeading } from "@/components/common/PageHeading";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROUTES } from "@/config/routes";
import { formatManilaDate } from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import { ENCOUNTER_TYPE_LABELS } from "@/features/health-records/constants";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import {
  useResidentHealthHistory,
  useResidentHealthHistoryEntry,
} from "@/features/resident-health-history/hooks";

const VITAL_FIELDS = [
  ["temperature_c", "Temperature", "°C"],
  ["systolic_bp", "Systolic blood pressure", "mmHg"],
  ["diastolic_bp", "Diastolic blood pressure", "mmHg"],
  ["pulse_bpm", "Pulse", "bpm"],
  ["respiratory_rate", "Respiratory rate", "breaths/min"],
  ["oxygen_saturation", "SpO2", "%"],
  ["height_cm", "Height", "cm"],
  ["weight_kg", "Weight", "kg"],
  ["pain_score", "Pain score", "/10"],
];

function serviceLabel(entry) {
  return (
    entry.service_type ||
    ENCOUNTER_TYPE_LABELS[entry.encounter_type] ||
    "Health-center visit"
  );
}

function Value({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function HistoryDetails({ id, onClose, returnFocusRef }) {
  const query = useResidentHealthHistoryEntry(id);
  const record = query.data;
  const summary = record?.summary ?? {};
  const vitals = record?.vital_signs ?? {};
  const measurements = VITAL_FIELDS.filter(([key]) => vitals[key] != null);
  return (
    <Dialog
      open={Boolean(id)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-2xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Finalized health history</DialogTitle>
          <DialogDescription>
            Your official finalized record, shown read-only. Contact the health
            center if you have questions about this record.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <LoadingState compact title="Loading finalized record" />
        ) : query.isError || !record ? (
          <ErrorState
            compact
            title="Finalized record unavailable"
            description={
              query.error?.message ??
              "This finalized record is unavailable to your account."
            }
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : (
          <div className="min-w-0 space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Value label="Visit date">
                {formatManilaDate(record.encounter_date)}
              </Value>
              <Value label="Service">{serviceLabel(record)}</Value>
              <Value label="Status">
                Finalized{record.is_amended ? " · Amended record" : ""}
              </Value>
              {record.staff_name ? (
                <Value label="Healthcare staff">{record.staff_name}</Value>
              ) : null}
            </dl>
            {measurements.length ? (
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Recorded vitals</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  {measurements.map(([key, label, unit]) => (
                    <Value key={key} label={label}>
                      {vitals[key]} {unit}
                    </Value>
                  ))}
                </dl>
              </section>
            ) : null}
            {Object.values(summary).some(
              (value) => value != null && value !== "",
            ) ? (
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Finalized health summary</h3>
                <dl className="mt-3 space-y-4">
                  {summary.chief_complaint ? (
                    <Value label="Reason for visit">
                      {summary.chief_complaint}
                    </Value>
                  ) : null}
                  {summary.assessment ? (
                    <Value label="Assessment">{summary.assessment}</Value>
                  ) : null}
                  {summary.plan ? (
                    <Value label="Plan / Follow-up instructions">
                      {summary.plan}
                    </Value>
                  ) : null}
                  {summary.follow_up_date ? (
                    <Value label="Follow-up date">
                      {formatManilaDate(summary.follow_up_date)}
                    </Value>
                  ) : null}
                </dl>
              </section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MyHealthHistoryPage() {
  const { profile } = useAuth();
  if (
    profile?.role !== "resident" ||
    profile.account_status !== "active" ||
    profile.retired_at
  ) {
    return <Navigate to={ROUTES.accessDenied} replace />;
  }
  return <ResidentHistory />;
}

function ResidentHistory() {
  const [filters, setFilters] = useState({ page: 1, page_size: 20 });
  const [selectedId, setSelectedId] = useState(null);
  const returnFocusRef = useRef(null);
  const query = useResidentHealthHistory(filters);
  return (
    <ContentContainer className="min-w-0 space-y-6">
      <PageHeading
        eyebrow="Your health-center history"
        title="My Health History"
        description="View your finalized health-center visit history and recorded health information."
      />
      <p className="text-sm text-muted-foreground">
        Healthcare personnel maintain your official clinical record. This
        read-only history shows finalized records and completed services; a
        completed visit does not mean its clinical documentation has been
        finalized.
      </p>
      {query.isLoading ? (
        <LoadingState title="Loading your health history" />
      ) : query.isError ? (
        <ErrorState
          title="Health history unavailable"
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : !query.data?.items.length ? (
        <EmptyState
          title="No finalized health records yet."
          description="Completed and finalized health-center records will appear here when available."
        />
      ) : (
        <section
          className="min-w-0 space-y-3"
          aria-label="Your finalized records and completed visits"
        >
          {query.data.items.map((entry) => (
            <article
              key={`${entry.kind}:${entry.id}`}
              className="min-w-0 rounded-xl border bg-card p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <h2 className="break-words font-heading font-semibold">
                    {serviceLabel(entry)}
                  </h2>
                  <p className="text-sm">
                    {formatManilaDate(entry.visit_date)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.kind === "encounter"
                      ? "Finalized clinical record"
                      : entry.kind === "event"
                        ? "Completed health service event"
                        : "Completed health-center visit"}
                  </p>
                  {entry.staff_name ? (
                    <p className="break-words text-sm text-muted-foreground">
                      Healthcare staff: {entry.staff_name}
                    </p>
                  ) : null}
                </div>
                <Badge variant="success" className="self-start">
                  {entry.status === "finalized" ? "Finalized" : "Completed"}
                  {entry.is_amended ? " · Amended" : ""}
                </Badge>
              </div>
              {entry.kind === "encounter" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 min-h-11 w-full sm:w-auto"
                  onClick={(event) => {
                    returnFocusRef.current = event.currentTarget;
                    setSelectedId(entry.id);
                  }}
                  aria-label={`View finalized ${serviceLabel(entry)} record for ${formatManilaDate(entry.visit_date)}`}
                >
                  <Eye /> View finalized record
                </Button>
              ) : null}
            </article>
          ))}
          <RegistryPagination
            page={filters.page}
            pageSize={filters.page_size}
            total={query.data.total}
            onChange={(change) =>
              setFilters((current) => ({ ...current, ...change }))
            }
          />
        </section>
      )}
      {selectedId ? (
        <HistoryDetails
          id={selectedId}
          onClose={() => setSelectedId(null)}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </ContentContainer>
  );
}
