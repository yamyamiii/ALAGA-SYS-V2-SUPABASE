import { CalendarPlus, Eye, Search, UserRoundPlus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  APPOINTMENT_PRIORITIES,
  APPOINTMENT_SORTS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPES,
  INITIAL_APPOINTMENT_FILTERS,
  PRIORITY_LABELS,
  SERVICE_TYPES,
} from "@/features/appointments/constants";
import { AppointmentDetailDialog } from "@/features/appointments/AppointmentDetailDialog";
import { AppointmentFormDialog } from "@/features/appointments/AppointmentFormDialog";
import { AppointmentStaffField } from "@/features/appointments/AppointmentStaffField";
import { AppointmentTabs } from "@/features/appointments/AppointmentTabs";
import {
  useAppointments,
  useIncomingResidentAppointmentRequests,
} from "@/features/appointments/hooks";
import { ResidentAppointmentsPage } from "@/features/appointments/ResidentAppointmentsPage";
import {
  formatManilaDate,
  formatManilaTime,
} from "@/features/appointments/timezone";
import { useAuth } from "@/features/auth/authContext";
import {
  hasPermission,
  PERMISSIONS,
  USER_ROLES,
} from "@/features/auth/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { RegistrySkeleton } from "@/features/registry/RegistrySkeleton";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";

export default function AppointmentListPage() {
  const { profile } = useAuth();

  if (profile.role === USER_ROLES.RESIDENT) {
    return <ResidentAppointmentsPage />;
  }

  return <StaffAppointmentListPage profile={profile} />;
}

function StaffAppointmentListPage({ profile }) {
  const canSchedule = hasPermission(
    profile.role,
    PERMISSIONS.SCHEDULE_APPOINTMENTS,
  );
  const [filters, setFilters] = useState({ ...INITIAL_APPOINTMENT_FILTERS });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const [staffFilter, setStaffFilter] = useState(null);
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [debouncedSearch, filters],
  );
  const query = useAppointments(effectiveFilters);
  const incomingQuery = useIncomingResidentAppointmentRequests(canSchedule);
  const [form, setForm] = useState({
    open: false,
    appointment: null,
    walkIn: false,
  });
  const [detailId, setDetailId] = useState(null);

  function update(next) {
    setFilters((current) => ({ ...current, ...next }));
  }

  function clearFilters() {
    setSearch("");
    setStaffFilter(null);
    setFilters({ ...INITIAL_APPOINTMENT_FILTERS });
  }

  const items = query.data?.items ?? [];
  const hasFilters = Boolean(
    debouncedSearch ||
    filters.date_from ||
    filters.date_to ||
    filters.status ||
    filters.appointment_type ||
    filters.service_type ||
    filters.priority ||
    filters.assigned_staff_id ||
    filters.include_archived,
  );

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Scheduling"
        title="Appointments"
        description={
          profile.role === USER_ROLES.NURSE
            ? "Only appointments assigned to your active staff profile are shown. Times are displayed in Asia/Manila."
            : "Schedule and manage operational health-center visits. Times are displayed in Asia/Manila."
        }
        actions={
          canSchedule ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setForm({ open: true, appointment: null, walkIn: true })
                }
              >
                <UserRoundPlus /> Register walk-in
              </Button>
              <Button
                onClick={() =>
                  setForm({ open: true, appointment: null, walkIn: false })
                }
              >
                <CalendarPlus /> Create appointment
              </Button>
            </div>
          ) : null
        }
      />
      <AppointmentTabs />

      {canSchedule ? (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div>
              <h2 className="font-heading text-lg font-semibold">
                Incoming resident requests
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review pending preferred schedules, assign eligible staff, then
                confirm or reject with a reason.
              </p>
            </div>
            {incomingQuery.isLoading ? (
              <LoadingState compact title="Loading resident requests" />
            ) : incomingQuery.isError ? (
              <ErrorState
                compact
                title="Resident requests could not be loaded"
                description={incomingQuery.error.message}
                actionLabel="Try again"
                onAction={() => incomingQuery.refetch()}
              />
            ) : (incomingQuery.data?.items ?? []).length === 0 ? (
              <EmptyState
                compact
                title="No pending resident requests"
                description="New online requests will appear here for review."
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {incomingQuery.data.items.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => setDetailId(request.id)}
                    className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {request.appointment_number}
                        </p>
                        <p className="mt-1 text-sm">{request.resident_name}</p>
                      </div>
                      <Badge variant="secondary">Resident request</Badge>
                    </div>
                    <p className="mt-3 text-sm">{request.service_type}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatManilaDate(request.scheduled_date)} ·{" "}
                      {formatManilaTime(request.start_time)}–
                      {formatManilaTime(request.end_time)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="space-y-5 p-4 sm:p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  update({ page: 1 });
                }}
                placeholder="Search appointment, resident number, or name"
                className="pl-9"
                aria-label="Search appointments"
              />
            </div>
            <Input
              type="date"
              value={filters.date_from}
              onChange={(event) =>
                update({ date_from: event.target.value, page: 1 })
              }
              aria-label="Appointment date from"
            />
            <Input
              type="date"
              value={filters.date_to}
              onChange={(event) =>
                update({ date_to: event.target.value, page: 1 })
              }
              aria-label="Appointment date to"
            />
            <select
              value={filters.status}
              onChange={(event) =>
                update({ status: event.target.value, page: 1 })
              }
              aria-label="Filter appointment status"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All statuses</option>
              {APPOINTMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {APPOINTMENT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={filters.appointment_type}
              onChange={(event) =>
                update({ appointment_type: event.target.value, page: 1 })
              }
              aria-label="Filter appointment type"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All appointment types</option>
              {APPOINTMENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {APPOINTMENT_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={filters.service_type}
              onChange={(event) =>
                update({ service_type: event.target.value, page: 1 })
              }
              aria-label="Filter service type"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All services</option>
              {SERVICE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={filters.priority}
              onChange={(event) =>
                update({ priority: event.target.value, page: 1 })
              }
              aria-label="Filter priority"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">All priorities</option>
              {APPOINTMENT_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={filters.sort}
              onChange={(event) =>
                update({ sort: event.target.value, page: 1 })
              }
              aria-label="Sort appointments"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              {Object.entries(APPOINTMENT_SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filters.direction}
              onChange={(event) =>
                update({ direction: event.target.value, page: 1 })
              }
              aria-label="Sort direction"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            {profile.role === USER_ROLES.ADMINISTRATOR ? (
              <label className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={filters.include_archived}
                  onChange={(event) =>
                    update({ include_archived: event.target.checked, page: 1 })
                  }
                />{" "}
                Include archived
              </label>
            ) : null}
          </div>

          {canSchedule ? (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Filter by assigned staff
              </summary>
              <div className="mt-3 max-w-xl">
                <AppointmentStaffField
                  value={filters.assigned_staff_id}
                  selected={staffFilter}
                  serviceType={filters.service_type || "General Consultation"}
                  onChange={(staff) => {
                    setStaffFilter(staff);
                    update({ assigned_staff_id: staff?.id ?? "", page: 1 });
                  }}
                />
              </div>
            </details>
          ) : null}

          {query.isLoading ? (
            <RegistrySkeleton />
          ) : query.isError ? (
            <ErrorState
              title="Appointments could not be loaded"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="No appointments found"
              description={
                hasFilters
                  ? "Adjust or clear the current filters."
                  : "No appointments are available to your account."
              }
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={clearFilters}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1040px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Appointment</th>
                      <th className="px-3 py-3">Resident</th>
                      <th className="px-3 py-3">Schedule</th>
                      <th className="px-3 py-3">Service</th>
                      <th className="px-3 py-3">Priority</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Staff</th>
                      <th className="w-12 px-3 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/35">
                        <td className="px-3 py-4 font-semibold">
                          {item.appointment_number}
                        </td>
                        <td className="px-3 py-4">
                          <p>{item.resident_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.resident_number}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          {formatManilaDate(item.scheduled_date)}
                          <br />
                          <span className="text-xs text-muted-foreground">
                            {item.appointment_type === "walk_in"
                              ? "Walk-in"
                              : formatManilaTime(item.start_time)}
                          </span>
                        </td>
                        <td className="px-3 py-4">{item.service_type}</td>
                        <td className="px-3 py-4">
                          <Badge
                            variant={
                              item.priority === "urgent"
                                ? "destructive"
                                : item.priority === "priority"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {PRIORITY_LABELS[item.priority]}
                          </Badge>
                        </td>
                        <td className="px-3 py-4">
                          <StatusBadge
                            status={APPOINTMENT_STATUS_LABELS[item.status]}
                          />
                        </td>
                        <td className="px-3 py-4">
                          {item.staff_name || "Unassigned"}
                        </td>
                        <td className="px-3 py-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`View ${item.appointment_number}`}
                            onClick={() => setDetailId(item.id)}
                          >
                            <Eye />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 lg:hidden">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDetailId(item.id)}
                    className="w-full rounded-xl border p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {item.appointment_number}
                        </p>
                        <p className="mt-1 text-sm">{item.resident_name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatManilaDate(item.scheduled_date)} ·{" "}
                          {item.appointment_type === "walk_in"
                            ? "Walk-in"
                            : formatManilaTime(item.start_time)}
                        </p>
                      </div>
                      <StatusBadge
                        status={APPOINTMENT_STATUS_LABELS[item.status]}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">{item.service_type}</Badge>
                      <Badge
                        variant={
                          item.priority === "urgent"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {PRIORITY_LABELS[item.priority]}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
              <RegistryPagination
                page={filters.page}
                pageSize={filters.page_size}
                total={query.data.total}
                onChange={update}
              />
            </>
          )}
        </CardContent>
      </Card>

      <AppointmentFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        appointment={form.appointment}
        walkIn={form.walkIn}
        onSaved={() =>
          setForm({ open: false, appointment: null, walkIn: false })
        }
      />
      <AppointmentDetailDialog
        appointmentId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onEdit={(appointment) =>
          setForm({ open: true, appointment, walkIn: false })
        }
      />
    </div>
  );
}
