import { ArrowDownAZ, Eye, Plus, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeading } from "@/components/common/PageHeading";
import { EmptyState, ErrorState } from "@/components/common/StateDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/authContext";
import { hasPermission, PERMISSIONS } from "@/features/auth/permissions";
import {
  initialResidentFilters,
  RESIDENT_SORTS,
  RESIDENT_STATUS_LABELS,
  SEX_LABELS,
  SEX_OPTIONS,
} from "@/features/registry/constants";
import { formatPersonName } from "@/features/registry/formatters";
import {
  useDeploymentContext,
  usePuroks,
  useRegistryMutation,
  useResidents,
} from "@/features/registry/hooks";
import { DeploymentBarangayContext } from "@/features/registry/DeploymentBarangayContext";
import { RegistryActionDialog } from "@/features/registry/RegistryActionDialog";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { RegistrySkeleton } from "@/features/registry/RegistrySkeleton";
import { ResidentDetailDialog } from "@/features/registry/ResidentDetailDialog";
import { ResidentAccountDialog } from "@/features/registry/ResidentAccountDialog";
import { ResidentFormDialog } from "@/features/registry/ResidentFormDialog";
import { ResidentHouseholdDialog } from "@/features/registry/ResidentHouseholdDialog";
import { ResidentHouseholdHeadDialog } from "@/features/registry/ResidentHouseholdHeadDialog";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";
import { registryService } from "@/services/registryService";

export default function ResidentRegistryPage() {
  const { profile } = useAuth();
  const canManage = hasPermission(profile.role, PERMISSIONS.MANAGE_RESIDENTS);
  const canRestore = hasPermission(
    profile.role,
    PERMISSIONS.RESTORE_ARCHIVED_REGISTRY,
  );
  const canLinkAccount = hasPermission(
    profile.role,
    PERMISSIONS.LINK_RESIDENT_ACCOUNTS,
  );
  const [filters, setFilters] = useState({ ...initialResidentFilters });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [debouncedSearch, filters],
  );
  const query = useResidents(effectiveFilters);
  const deploymentContext = useDeploymentContext();
  const puroks = usePuroks();
  const [form, setForm] = useState({ open: false, record: null });
  const [detailId, setDetailId] = useState(null);
  const [householdRecord, setHouseholdRecord] = useState(null);
  const [headResolution, setHeadResolution] = useState({
    record: null,
    continueToArchive: false,
  });
  const [accountRecord, setAccountRecord] = useState(null);
  const [action, setAction] = useState({ record: null, restoring: false });
  const statusMutation = useRegistryMutation(({ id, status }) =>
    registryService.setResidentStatus(id, status),
  );

  function update(next) {
    setFilters((current) => ({ ...current, ...next }));
  }

  function clearFilters() {
    setSearch("");
    setFilters({ ...initialResidentFilters });
  }

  function requestStatusChange(record, restoring) {
    const isHouseholdHead =
      Boolean(record.household_id) &&
      record.household?.head_resident_id === record.id;
    if (!restoring && isHouseholdHead) {
      setHeadResolution({ record, continueToArchive: true });
      return;
    }
    setAction({ record, restoring });
  }

  function resolveHeadConflict() {
    const record = action.record;
    statusMutation.reset();
    setAction({ record: null, restoring: false });
    setHeadResolution({ record, continueToArchive: true });
  }

  function finishHeadResolution({ newHeadId }) {
    const resolved = headResolution;
    setHeadResolution({ record: null, continueToArchive: false });
    if (resolved.continueToArchive && resolved.record) {
      setAction({
        record: {
          ...resolved.record,
          household: {
            ...resolved.record.household,
            head_resident_id: newHeadId,
          },
        },
        restoring: false,
      });
    }
  }

  async function confirmStatus() {
    try {
      await statusMutation.mutateAsync({
        id: action.record.id,
        status: action.restoring ? "active" : "archived",
      });
      toast.success(
        action.restoring ? "Resident restored" : "Resident archived",
      );
      setAction({ record: null, restoring: false });
      setDetailId(null);
    } catch {
      // The mapped error stays visible in the confirmation dialog.
    }
  }

  const items = query.data?.items ?? [];
  const hasFilters = Boolean(
    debouncedSearch ||
    filters.purok_id ||
    filters.sex ||
    filters.status ||
    filters.is_senior_citizen ||
    filters.is_pwd ||
    filters.household_filter !== "all" ||
    filters.archive_filter !== "current",
  );

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Registry"
        title="Residents"
        description="Search and maintain demographic registry records. Ages are calculated from date of birth and resident numbers are database-generated."
        actions={
          canManage ? (
            <Button
              onClick={() => setForm({ open: true, record: null })}
              disabled={
                deploymentContext.isLoading || deploymentContext.isError
              }
            >
              <Plus /> Add resident
            </Button>
          ) : null
        }
      />
      <DeploymentBarangayContext query={deploymentContext} compact />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  update({ page: 1 });
                }}
                placeholder="Search number, name, phone, address, or household"
                aria-label="Search residents"
                className="pl-9"
              />
            </div>
            <select
              value={filters.purok_id}
              onChange={(event) =>
                update({ purok_id: event.target.value, page: 1 })
              }
              disabled={puroks.isLoading || deploymentContext.isError}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50"
              aria-label="Filter residents by purok"
            >
              <option value="">All puroks</option>
              {(puroks.data ?? []).map((purok) => (
                <option key={purok.id} value={purok.id}>
                  {purok.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <select
              value={filters.sex}
              onChange={(event) => update({ sex: event.target.value, page: 1 })}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Filter residents by sex"
            >
              <option value="">All sexes</option>
              {SEX_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {SEX_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(event) =>
                update({ status: event.target.value, page: 1 })
              }
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Filter residents by status"
            >
              <option value="">All statuses</option>
              {Object.entries(RESIDENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={filters.is_senior_citizen}
              onChange={(event) =>
                update({ is_senior_citizen: event.target.value, page: 1 })
              }
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Filter by senior citizen status"
            >
              <option value="">All ages</option>
              <option value="true">Senior citizens</option>
              <option value="false">Not senior</option>
            </select>
            <select
              value={filters.is_pwd}
              onChange={(event) =>
                update({ is_pwd: event.target.value, page: 1 })
              }
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Filter by PWD status"
            >
              <option value="">All PWD statuses</option>
              <option value="true">PWD</option>
              <option value="false">Not PWD</option>
            </select>
            <select
              value={filters.household_filter}
              onChange={(event) =>
                update({ household_filter: event.target.value, page: 1 })
              }
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Filter by household assignment"
            >
              <option value="all">All assignments</option>
              <option value="assigned">Assigned household</option>
              <option value="unassigned">No household</option>
            </select>
            {canRestore ? (
              <select
                value={filters.archive_filter}
                onChange={(event) =>
                  update({ archive_filter: event.target.value, page: 1 })
                }
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                aria-label="Filter archived residents"
              >
                <option value="current">Current records</option>
                <option value="archived">Archived only</option>
                <option value="all">Current and archived</option>
              </select>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={filters.sort}
              onChange={(event) =>
                update({ sort: event.target.value, page: 1 })
              }
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              aria-label="Sort residents"
            >
              {Object.entries(RESIDENT_SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  Sort: {label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                update({
                  direction: filters.direction === "asc" ? "desc" : "asc",
                })
              }
            >
              <ArrowDownAZ />{" "}
              {filters.direction === "asc" ? "Ascending" : "Descending"}
            </Button>
            {hasFilters ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>

          {query.isLoading ? (
            <RegistrySkeleton columns={9} />
          ) : query.isError ? (
            <ErrorState
              title="Residents could not be loaded"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={hasFilters ? "No residents match" : "No residents yet"}
              description={
                hasFilters
                  ? "Adjust or clear the search and filters."
                  : "Add the first resident when registry work begins."
              }
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={hasFilters ? clearFilters : undefined}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Resident number</th>
                      <th className="px-3 py-3">Full name</th>
                      <th className="px-3 py-3">Age</th>
                      <th className="px-3 py-3">Sex</th>
                      <th className="px-3 py-3">Purok</th>
                      <th className="px-3 py-3">Household</th>
                      <th className="px-3 py-3">Phone</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/35">
                        <td className="px-3 py-4 font-semibold">
                          {item.resident_number}
                        </td>
                        <td className="px-3 py-4">{formatPersonName(item)}</td>
                        <td className="px-3 py-4">{item.age_years ?? "—"}</td>
                        <td className="px-3 py-4">{SEX_LABELS[item.sex]}</td>
                        <td className="px-3 py-4">{item.purok_name}</td>
                        <td className="px-3 py-4">
                          {item.household_number || "Unassigned"}
                        </td>
                        <td className="px-3 py-4 text-muted-foreground">
                          {item.phone_number || "—"}
                        </td>
                        <td className="px-3 py-4">
                          <StatusBadge
                            status={RESIDENT_STATUS_LABELS[item.status]}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`View ${formatPersonName(item)}`}
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
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {formatPersonName(item)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.resident_number}
                        </p>
                      </div>
                      <StatusBadge
                        status={RESIDENT_STATUS_LABELS[item.status]}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <span>
                        {item.age_years ?? "—"} years · {SEX_LABELS[item.sex]}
                      </span>
                      <span>{item.purok_name}</span>
                      <span>{item.household_number || "No household"}</span>
                      <span>{item.phone_number || "No phone"}</span>
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

      <ResidentFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        resident={form.record}
        onSaved={() => setForm({ open: false, record: null })}
      />
      <ResidentDetailDialog
        residentId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        canManage={canManage}
        canRestore={canRestore}
        canLinkAccount={canLinkAccount}
        onEdit={(record) => setForm({ open: true, record })}
        onArchive={requestStatusChange}
        onHousehold={setHouseholdRecord}
        onChangeHouseholdHead={(record) =>
          setHeadResolution({ record, continueToArchive: false })
        }
        onAccount={setAccountRecord}
      />
      <ResidentAccountDialog
        open={Boolean(accountRecord)}
        onOpenChange={(open) => {
          if (!open) setAccountRecord(null);
        }}
        resident={accountRecord}
      />
      <ResidentHouseholdDialog
        open={Boolean(householdRecord)}
        onOpenChange={(open) => {
          if (!open) setHouseholdRecord(null);
        }}
        resident={householdRecord}
        onSaved={() => setHouseholdRecord(null)}
      />
      <ResidentHouseholdHeadDialog
        open={Boolean(headResolution.record)}
        onOpenChange={(open) => {
          if (!open) {
            setHeadResolution({ record: null, continueToArchive: false });
          }
        }}
        resident={headResolution.record}
        continueToArchive={headResolution.continueToArchive}
        canArchiveSoleHousehold={canRestore}
        onResolved={finishHeadResolution}
        onSoleArchived={() => {
          setHeadResolution({ record: null, continueToArchive: false });
          setDetailId(null);
        }}
      />
      <RegistryActionDialog
        open={Boolean(action.record)}
        onOpenChange={(open) => {
          if (!open) {
            statusMutation.reset();
            setAction({ record: null, restoring: false });
          }
        }}
        kind="resident"
        recordLabel={
          action.record
            ? `${action.record.resident_number} · ${formatPersonName(action.record)}`
            : ""
        }
        restoring={action.restoring}
        pending={statusMutation.isPending}
        error={statusMutation.error}
        errorActionLabel={
          statusMutation.error?.code === "household_head_conflict"
            ? "Change household head"
            : undefined
        }
        onErrorAction={
          statusMutation.error?.code === "household_head_conflict"
            ? resolveHeadConflict
            : undefined
        }
        onConfirm={confirmStatus}
      />
      <div className="flex items-start gap-2 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        <UsersRound className="h-4 w-4 shrink-0 text-primary" />
        This phase stores demographic registry information only. No clinical,
        appointment, medicine, or maternal-care records are shown.
      </div>
    </div>
  );
}
