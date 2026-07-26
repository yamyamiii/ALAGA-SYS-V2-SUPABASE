import { FileHeart, Stethoscope } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth/authContext";
import { EncounterCreateDialog } from "@/features/health-records/EncounterCreateDialog";
import { useAppointmentHealthRecord } from "@/features/health-records/hooks";
import { canCreateEncounter } from "@/features/health-records/permissions";

export function AppointmentEncounterAction({ appointment }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const query = useAppointmentHealthRecord(
    appointment.id,
    Boolean(appointment),
  );
  const canStart =
    canCreateEncounter(profile.role) &&
    appointment.assigned_staff_id === profile.id &&
    (profile.role !== "midwife" ||
      ["Maternal Care", "Child Health"].includes(appointment.service_type)) &&
    ["in_progress", "completed"].includes(appointment.status) &&
    !appointment.resident?.archived_at &&
    appointment.resident?.status === "active";

  if (query.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Checking clinical record…</p>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="space-y-2">
        <p className="text-sm text-destructive">{query.error.message}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => query.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {query.data ? (
        <Button asChild variant="outline">
          <Link to={ROUTES.healthRecordDetail(query.data.id)}>
            <FileHeart /> Open Health Record
          </Link>
        </Button>
      ) : canStart ? (
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Stethoscope /> Start Clinical Encounter
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          A clinical encounter becomes available to assigned clinical staff when
          this appointment is in progress or completed.
        </p>
      )}
      <EncounterCreateDialog
        appointment={appointment}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(record) => navigate(ROUTES.healthRecordDetail(record.id))}
      />
    </div>
  );
}
