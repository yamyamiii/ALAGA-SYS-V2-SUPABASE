import { Eye, FilePlus2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ContentContainer } from "@/components/common/ContentContainer";
import { PageHeading } from "@/components/common/PageHeading";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROUTES } from "@/config/routes";
import { useAppointmentStaffSearch } from "@/features/appointments/hooks";
import { STAFF_SEARCH_MAX_PAGE_SIZE } from "@/features/appointments/constants";
import { formatManilaDate } from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import {
  ENCOUNTER_STATUSES,
  ENCOUNTER_STATUS_LABELS,
  ENCOUNTER_TYPES,
  ENCOUNTER_TYPE_LABELS,
  INITIAL_HEALTH_RECORD_FILTERS,
} from "@/features/health-records/constants";
import { EncounterCreateDialog } from "@/features/health-records/EncounterCreateDialog";
import { useHealthRecords } from "@/features/health-records/hooks";
import { canCreateEncounter } from "@/features/health-records/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";

function Status({ status }) {
  return (
    <Badge
      variant={
        status === "signed"
          ? "success"
          : status === "draft"
            ? "warning"
            : status === "archived"
              ? "secondary"
              : "outline"
      }
    >
      {ENCOUNTER_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export default function HealthRecordsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const section = ["encounters", "vital-signs"].includes(requestedSection)
    ? requestedSection
    : "encounters";
  const showEncounterContext = requestedSection === "encounters";
  const showVitalSignsContext = section === "vital-signs";
  const [filters, setFilters] = useState(INITIAL_HEALTH_RECORD_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 350);
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [debouncedSearch, filters],
  );
  const query = useHealthRecords(effectiveFilters);
  const staffQuery = useAppointmentStaffSearch(
    {
      search: "",
      serviceType: "",
      page: 1,
      pageSize: STAFF_SEARCH_MAX_PAGE_SIZE,
    },
    profile.role !== "resident",
  );
  const records = query.data?.items ?? [];
  const residentView = profile.role === "resident";
  const staff = useMemo(() => staffQuery.data?.items ?? [], [staffQuery.data]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value, page: 1 }));
  }

  return (
    <ContentContainer className="space-y-6">
      <PageHeading
        eyebrow="Clinical documentation"
        title={
          residentView
            ? showVitalSignsContext
              ? "My Vital Signs"
              : "My Health Records"
            : showVitalSignsContext
              ? "Vital Signs"
              : showEncounterContext
                ? "Clinical Encounters"
                : "Health Records"
        }
        description={
          residentView
            ? "Review only the signed health-center records linked to your resident account. Other residents and barangay-wide clinical records are never searchable here."
            : showVitalSignsContext
              ? "Select an authorized encounter to view its vital signs or, when permitted, document them. Record access remains protected by role permissions and row-level security."
              : showEncounterContext
                ? "Review the clinical encounters authorized for your role. Operational appointment notes remain separate."
                : "Secure clinical encounters, vital signs, allergies, and relevant history. Operational appointment notes remain separate."
        }
        actions={
          canCreateEncounter(profile.role) ? (
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus2 /> Create encounter
            </Button>
          ) : null
        }
      />

      <section className="space-y-4 rounded-xl border bg-card p-4">
        {!residentView ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search encounter number, resident number, or resident name"
              aria-label="Search health records"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Filter your own records by date, status, or encounter type.
          </p>
        )}
        <div
          className={`grid gap-3 sm:grid-cols-2 ${residentView ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}
        >
          <Input
            type="date"
            aria-label="Encounter date from"
            value={filters.date_from}
            onChange={(event) => updateFilter("date_from", event.target.value)}
          />
          <Input
            type="date"
            aria-label="Encounter date to"
            value={filters.date_to}
            onChange={(event) => updateFilter("date_to", event.target.value)}
          />
          <select
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
            aria-label="Encounter status"
          >
            <option value="">All statuses</option>
            {ENCOUNTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ENCOUNTER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            value={filters.encounter_type}
            onChange={(event) =>
              updateFilter("encounter_type", event.target.value)
            }
            aria-label="Encounter type"
          >
            <option value="">All encounter types</option>
            {ENCOUNTER_TYPES.map((type) => (
              <option key={type} value={type}>
                {ENCOUNTER_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          {!residentView ? (
            <select
              className="h-10 rounded-lg border bg-background px-3 text-sm"
              value={filters.attending_staff_id}
              onChange={(event) =>
                updateFilter("attending_staff_id", event.target.value)
              }
              aria-label="Attending clinical staff"
            >
              <option value="">All attending staff</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.staff_name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        {profile.role === "admin" ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.include_archived}
              onChange={(event) =>
                updateFilter("include_archived", event.target.checked)
              }
            />
            Include archived metadata
          </label>
        ) : null}
      </section>

      {query.isLoading ? (
        <LoadingState
          title="Loading health records"
          description="Retrieving only records authorized for your role…"
        />
      ) : query.isError ? (
        <ErrorState
          title={
            query.error.code === "permission_denied"
              ? "Clinical access denied"
              : "Health records unavailable"
          }
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : records.length === 0 ? (
        <EmptyState
          title={
            residentView ? "No health records yet" : "No health records found"
          }
          description={
            residentView
              ? "No signed health records are currently available for your linked resident account."
              : "Adjust the filters or create an authorized draft encounter."
          }
        />
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="space-y-3 p-4 lg:hidden">
            {records.map((record) => (
              <article key={record.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{record.encounter_number}</p>
                    {!residentView ? (
                      <>
                        <p className="mt-1 text-sm">{record.resident_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.resident_number}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <Status status={record.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Date</dt>
                    <dd>{formatManilaDate(record.encounter_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Type</dt>
                    <dd>{ENCOUNTER_TYPE_LABELS[record.encounter_type]}</dd>
                  </div>
                </dl>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link
                    to={`${ROUTES.healthRecordDetail(record.id)}${
                      showVitalSignsContext ? "#vital-signs" : ""
                    }`}
                  >
                    <Eye /> View details
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Encounter</th>
                  {!residentView ? (
                    <th className="px-4 py-3">Resident</th>
                  ) : null}
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Attending staff</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 font-semibold">
                      {record.encounter_number}
                    </td>
                    {!residentView ? (
                      <td className="px-4 py-3">
                        <p>{record.resident_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.resident_number}
                        </p>
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      {formatManilaDate(record.encounter_date)}
                    </td>
                    <td className="px-4 py-3">
                      {ENCOUNTER_TYPE_LABELS[record.encounter_type]}
                    </td>
                    <td className="px-4 py-3">{record.attending_staff_name}</td>
                    <td className="px-4 py-3">
                      <Status status={record.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          to={`${ROUTES.healthRecordDetail(record.id)}${
                            showVitalSignsContext ? "#vital-signs" : ""
                          }`}
                        >
                          <Eye /> View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      <EncounterCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(record) => navigate(ROUTES.healthRecordDetail(record.id))}
      />
    </ContentContainer>
  );
}
