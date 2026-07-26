import { FileHeart } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth/authContext";
import {
  useHealthRecords,
  useResidentAllergies,
  useResidentMedicalHistory,
} from "@/features/health-records/hooks";
import { canViewClinicalNarrative } from "@/features/health-records/permissions";

export function ResidentClinicalSummary({ resident }) {
  const { profile } = useAuth();
  const authorized = canViewClinicalNarrative(profile.role, {
    encounter_type: profile.role === "midwife" ? "maternal_care" : undefined,
  });
  const records = useHealthRecords({
    search: resident.resident_number,
    page: 1,
    page_size: 5,
    include_archived: false,
  });
  const allergies = useResidentAllergies(resident.id, authorized);
  const history = useResidentMedicalHistory(resident.id, authorized);

  if (!authorized) return null;
  if (records.isLoading || allergies.isLoading || history.isLoading) {
    return (
      <LoadingState
        compact
        title="Loading clinical timeline"
        description="Retrieving authorized clinical summaries…"
      />
    );
  }
  if (records.isError || allergies.isError || history.isError) {
    const failed = records.error ?? allergies.error ?? history.error;
    return (
      <ErrorState
        compact
        title="Clinical summary unavailable"
        description={failed.message}
        actionLabel="Try again"
        onAction={() => {
          records.refetch();
          allergies.refetch();
          history.refetch();
        }}
      />
    );
  }

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div>
        <h3 className="font-heading font-semibold">Clinical Timeline</h3>
        <p className="text-sm text-muted-foreground">
          Authorized allergies, relevant history, and recent encounters.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">Allergies</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {allergies.data.length ? (
              allergies.data.map((item) => (
                <li key={item.id}>
                  {item.allergen} · {item.severity}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No active entries</li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Medical History</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {history.data.length ? (
              history.data.map((item) => (
                <li key={item.id}>{item.condition_name}</li>
              ))
            ) : (
              <li className="text-muted-foreground">No active entries</li>
            )}
          </ul>
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold">Recent Encounters</h4>
        <div className="mt-2 space-y-2">
          {(records.data?.items ?? [])
            .filter((item) => item.resident_id === resident.id)
            .map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <span>
                  <strong>{item.encounter_number}</strong> ·{" "}
                  {item.encounter_date}
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link to={ROUTES.healthRecordDetail(item.id)}>
                    <FileHeart /> Open
                  </Link>
                </Button>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
