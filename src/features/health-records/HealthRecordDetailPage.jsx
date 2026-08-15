import {
  Archive,
  ArrowLeft,
  FileText,
  FilePenLine,
  FileSignature,
  HeartPulse,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ContentContainer } from "@/components/common/ContentContainer";
import { PageHeading } from "@/components/common/PageHeading";
import { SectionHeading } from "@/components/common/SectionHeading";
import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";
import {
  formatManilaDate,
  formatManilaTimestamp,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import { DocumentPreviewDialog } from "@/features/documents/DocumentPreviewDialog";
import { DOCUMENT_TYPES } from "@/features/documents/constants";
import { canPrintConsultationSummary } from "@/features/documents/permissions";
import { EncounterActionDialog } from "@/features/health-records/EncounterActionDialog";
import { EncounterClinicalFormDialog } from "@/features/health-records/EncounterClinicalFormDialog";
import {
  ENCOUNTER_STATUS_LABELS,
  ENCOUNTER_TYPE_LABELS,
} from "@/features/health-records/constants";
import { useHealthRecord } from "@/features/health-records/hooks";
import { missingEncounterSignFields } from "@/features/health-records/schemas";
import {
  canAmendEncounter,
  canArchiveEncounter,
  canEditEncounter,
  canRecordVitals,
  canSignEncounter,
  canViewClinicalNarrative,
} from "@/features/health-records/permissions";
import { VitalSignsDialog } from "@/features/health-records/VitalSignsDialog";
import { formatPersonName } from "@/features/registry/formatters";

function Value({ label, children, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm">
        {children || "Not documented"}
      </dd>
    </div>
  );
}

function Section({ id, title, description, children, plain = false }) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-xl border bg-card p-4 sm:p-5"
    >
      <SectionHeading title={title} description={description} />
      {plain ? (
        <div className="mt-4">{children}</div>
      ) : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children}
        </dl>
      )}
    </section>
  );
}

export default function HealthRecordDetailPage() {
  const { encounterId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const query = useHealthRecord(encounterId);
  const [editOpen, setEditOpen] = useState(false);
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [action, setAction] = useState(null);
  const [consultationPrintOpen, setConsultationPrintOpen] = useState(false);
  const encounter = query.data;
  const clinicalVisible =
    canViewClinicalNarrative(profile.role, encounter) &&
    Boolean(encounter?.clinical);

  if (query.isLoading) {
    return (
      <ContentContainer>
        <LoadingState
          title="Loading health record"
          description="Applying clinical access controls…"
        />
      </ContentContainer>
    );
  }
  if (query.isError || !encounter) {
    return (
      <ContentContainer>
        <ErrorState
          title={
            query.error?.code === "health_record_not_found"
              ? "Health record not found"
              : query.error?.code === "permission_denied"
                ? "Clinical access denied"
                : "Health record unavailable"
          }
          description={query.error?.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      </ContentContainer>
    );
  }

  const canEdit = canEditEncounter(profile.role, encounter, profile.id);
  const canSign = canSignEncounter(profile.role, encounter, profile.id);
  const canAmend = canAmendEncounter(profile.role, encounter);
  const canArchive = canArchiveEncounter(profile.role, encounter);
  const canVitals = canRecordVitals(profile.role, encounter, profile.id);
  const canPrintConsultation = canPrintConsultationSummary(
    profile.role,
    encounter,
  );
  const vitals = encounter.vital_signs;
  const missingSignFields = missingEncounterSignFields(encounter);
  const signReady = missingSignFields.length === 0;

  return (
    <ContentContainer className="space-y-6">
      <Button asChild variant="ghost" className="-ml-3">
        <Link to={ROUTES.healthRecords}>
          <ArrowLeft /> Back to health records
        </Link>
      </Button>
      <PageHeading
        eyebrow="Consultation record"
        title={encounter.encounter_number}
        description={`${ENCOUNTER_TYPE_LABELS[encounter.encounter_type]} · ${formatManilaDate(encounter.encounter_date)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canPrintConsultation ? (
              <Button
                variant="outline"
                onClick={() => setConsultationPrintOpen(true)}
              >
                <FileText /> Print Consultation Summary
              </Button>
            ) : null}
            {canEdit ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <FilePenLine /> Edit draft
              </Button>
            ) : null}
            {canVitals ? (
              <Button variant="outline" onClick={() => setVitalsOpen(true)}>
                <HeartPulse /> Record vitals
              </Button>
            ) : null}
            {canSign ? (
              <Button
                onClick={() => setAction("sign")}
                disabled={!signReady}
                aria-describedby={
                  signReady ? undefined : "encounter-sign-requirements"
                }
              >
                <FileSignature /> Sign
              </Button>
            ) : null}
            {canAmend ? (
              <Button variant="outline" onClick={() => setAction("amend")}>
                <FilePenLine /> Amend
              </Button>
            ) : null}
            {canArchive ? (
              <Button
                variant="destructive"
                onClick={() => setAction("archive")}
              >
                <Archive /> Archive
              </Button>
            ) : null}
          </div>
        }
      />

      {canSign && !signReady ? (
        <Alert id="encounter-sign-requirements">
          <ShieldAlert />
          <AlertTitle>
            Complete required documentation before signing
          </AlertTitle>
          <AlertDescription>
            Save the following draft fields first:{" "}
            {missingSignFields.join(", ")}.
          </AlertDescription>
        </Alert>
      ) : null}

      {!clinicalVisible ? (
        <Alert>
          <ShieldAlert />
          <AlertTitle>Clinical narrative restricted</AlertTitle>
          <AlertDescription>
            Your role may view administrative encounter metadata only. Clinical
            notes, diagnoses, treatment, allergies, and history are not exposed.
          </AlertDescription>
        </Alert>
      ) : null}

      <Section title="1. Encounter Information">
        <Value label="Status">
          <Badge
            variant={encounter.status === "signed" ? "success" : "warning"}
          >
            {ENCOUNTER_STATUS_LABELS[encounter.status]}
          </Badge>
        </Value>
        <Value label="Encounter type">
          {ENCOUNTER_TYPE_LABELS[encounter.encounter_type]}
        </Value>
        <Value label="Encounter date">
          {formatManilaDate(encounter.encounter_date)}
        </Value>
        <Value label="Attending staff">
          {formatPersonName(encounter.attending_staff)}
        </Value>
        <Value label="Signed">
          {formatManilaTimestamp(encounter.signed_at)}
        </Value>
        <Value label="Version">{encounter.version}</Value>
      </Section>

      <Section title="2. Resident Summary">
        <Value label="Resident">{formatPersonName(encounter.resident)}</Value>
        <Value label="Resident number">
          {encounter.resident?.resident_number}
        </Value>
        <Value label="Date of birth">
          {formatManilaDate(encounter.resident?.date_of_birth)}
        </Value>
        <Value label="Sex">{encounter.resident?.sex}</Value>
        <Value label="Blood type">{encounter.resident?.blood_type}</Value>
        <Value label="Registry status">{encounter.resident?.status}</Value>
      </Section>

      <Section title="3. Appointment Link">
        <Value label="Appointment number">
          {encounter.appointment?.appointment_number}
        </Value>
        <Value label="Service">{encounter.appointment?.service_type}</Value>
        <Value label="Operational status">
          {encounter.appointment?.status}
        </Value>
      </Section>

      <Section
        id="vital-signs"
        title="4. Vital Signs"
        description="BMI is calculated from the recorded height and weight."
      >
        <Value label="Temperature">
          {vitals?.temperature_c ? `${vitals.temperature_c} °C` : null}
        </Value>
        <Value label="Blood pressure">
          {vitals?.systolic_bp && vitals?.diastolic_bp
            ? `${vitals.systolic_bp}/${vitals.diastolic_bp} mmHg`
            : null}
        </Value>
        <Value label="Pulse">
          {vitals?.pulse_bpm ? `${vitals.pulse_bpm} bpm` : null}
        </Value>
        <Value label="Respiratory rate">
          {vitals?.respiratory_rate
            ? `${vitals.respiratory_rate} breaths/min`
            : null}
        </Value>
        <Value label="Oxygen saturation">
          {vitals?.oxygen_saturation ? `${vitals.oxygen_saturation}%` : null}
        </Value>
        <Value label="Pain score">{vitals?.pain_score}</Value>
        <Value label="Height">
          {vitals?.height_cm ? `${vitals.height_cm} cm` : null}
        </Value>
        <Value label="Weight">
          {vitals?.weight_kg ? `${vitals.weight_kg} kg` : null}
        </Value>
        <Value label="BMI">{vitals?.bmi}</Value>
      </Section>

      {clinicalVisible ? (
        <>
          <Section title="5. Chief Complaint">
            <Value label="Chief complaint" wide>
              {encounter.clinical.chief_complaint}
            </Value>
          </Section>
          <Section title="6. Subjective Notes">
            <Value label="Subjective documentation" wide>
              {encounter.clinical.subjective_notes}
            </Value>
          </Section>
          <Section title="7. Objective Notes">
            <Value label="Objective documentation" wide>
              {encounter.clinical.objective_notes}
            </Value>
          </Section>
          <Section title="8. Assessment">
            <Value label="Clinical assessment" wide>
              {encounter.clinical.assessment}
            </Value>
          </Section>
          <Section title="9. Diagnosis">
            <Value label="Diagnosis text" wide>
              {encounter.clinical.diagnosis_text}
            </Value>
          </Section>
          <Section title="10. Plan and Treatment">
            <Value label="Plan" wide>
              {encounter.clinical.plan}
            </Value>
            <Value label="Treatment notes" wide>
              {encounter.clinical.treatment_notes}
            </Value>
          </Section>
          <Section title="11. Follow-up">
            <Value label="Follow-up date">
              {formatManilaDate(encounter.clinical.follow_up_date)}
            </Value>
          </Section>
        </>
      ) : null}

      <EncounterClinicalFormDialog
        encounter={encounter}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => query.refetch()}
      />
      <VitalSignsDialog
        encounter={encounter}
        open={vitalsOpen}
        onOpenChange={setVitalsOpen}
        onSaved={() => query.refetch()}
      />
      <EncounterActionDialog
        encounter={encounter}
        action={action}
        open={Boolean(action)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setAction(null);
        }}
        onCompleted={(result) => {
          if (action === "amend") {
            navigate(ROUTES.healthRecordDetail(result.id));
          } else {
            query.refetch();
          }
        }}
      />
      {consultationPrintOpen ? (
        <DocumentPreviewDialog
          documentType={DOCUMENT_TYPES.CONSULTATION_SUMMARY}
          recordId={encounterId}
          open
          onOpenChange={setConsultationPrintOpen}
        />
      ) : null}
    </ContentContainer>
  );
}
