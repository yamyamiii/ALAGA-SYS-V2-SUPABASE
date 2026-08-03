import { Eye, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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
import { useAuth } from "@/features/auth/authContext";
import {
  INITIAL_MATERNAL_CHILD_FILTERS,
  MATERNAL_CHILD_TABS,
  PREGNANCY_STATUSES,
} from "@/features/maternal-child-care/constants";
import { MaternalChildDetailDialog } from "@/features/maternal-child-care/MaternalChildDetailDialog";
import { MaternalChildFormDialog } from "@/features/maternal-child-care/MaternalChildFormDialog";
import { useMaternalChildList } from "@/features/maternal-child-care/hooks";
import { canCreateMaternalChildProfile } from "@/features/maternal-child-care/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";

export default function MaternalChildCarePage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const tabId = MATERNAL_CHILD_TABS.some((item) => item.id === requestedSection)
    ? requestedSection
    : "pregnancies";
  const [filters, setFilters] = useState(INITIAL_MATERNAL_CHILD_FILTERS);
  const [formKind, setFormKind] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const tab = MATERNAL_CHILD_TABS.find((item) => item.id === tabId);
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 350);
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );
  const query = useMaternalChildList(tab.kind, effectiveFilters);
  const records = query.data?.items ?? [];

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value, page: 1 }));
  }

  function changeTab(next) {
    setSearchParams({ section: next.id });
    setFilters(INITIAL_MATERNAL_CHILD_FILTERS);
  }

  return (
    <ContentContainer className="space-y-6">
      <PageHeading
        eyebrow="Longitudinal community care"
        title="Maternal and Child Care"
        description="Pregnancy, prenatal, delivery, postnatal, growth, child visits, and immunization timelines for Brgy. Bagongpook."
        actions={
          canCreateMaternalChildProfile(profile.role) ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setFormKind("child")}>
                <Plus /> Child profile
              </Button>
              <Button onClick={() => setFormKind("pregnancy")}>
                <Plus /> Pregnancy
              </Button>
            </div>
          ) : null
        }
      />

      <nav
        aria-label="Maternal and child care sections"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {MATERNAL_CHILD_TABS.map((item) => (
          <Button
            key={item.id}
            variant={item.id === tabId ? "default" : "outline"}
            size="sm"
            aria-current={item.id === tabId ? "page" : undefined}
            onClick={() => changeTab(item)}
          >
            {item.label}
          </Button>
        ))}
      </nav>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div>
          <h2 className="font-heading font-semibold">{tab.label}</h2>
          <p className="text-sm text-muted-foreground">
            Select a record to view its authorized {tab.label.toLowerCase()}{" "}
            timeline.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              placeholder="Search record number, resident number, or name"
              aria-label={`Search ${tab.label.toLowerCase()}`}
            />
          </div>
          {tab.kind === "pregnancy" ? (
            <select
              className="h-10 rounded-lg border bg-background px-3 text-sm"
              value={filters.status}
              onChange={(event) => updateFilter("status", event.target.value)}
              aria-label="Pregnancy status"
            >
              <option value="">All pregnancy statuses</option>
              {PREGNANCY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status[0].toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="h-10 rounded-lg border bg-background px-3 text-sm"
              value={filters.immunization_status}
              onChange={(event) =>
                updateFilter("immunization_status", event.target.value)
              }
              aria-label="Immunization status"
            >
              <option value="">All immunization statuses</option>
              <option value="due">Due</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed</option>
              <option value="deferred">Deferred</option>
            </select>
          )}
        </div>
      </section>

      {query.isLoading ? (
        <LoadingState
          title={`Loading ${tab.label.toLowerCase()}`}
          description="Retrieving only records authorized for your role…"
        />
      ) : query.isError ? (
        <ErrorState
          title={
            query.error.code === "permission_denied"
              ? "Care access denied"
              : `${tab.label} unavailable`
          }
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : records.length === 0 ? (
        <EmptyState
          title={`No ${tab.label.toLowerCase()} found`}
          description="Adjust the filters or create an authorized record."
        />
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="space-y-3 p-4 lg:hidden">
            {records.map((record) => (
              <article key={record.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {record.pregnancy_number ?? record.child_number}
                    </p>
                    <p className="mt-1 text-sm">
                      {record.resident_name ?? record.child_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {record.resident_number}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {record.status ??
                      (record.has_due_immunization
                        ? "Immunization due"
                        : "Active")}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => setSelectedId(record.id)}
                >
                  <Eye /> View timeline
                </Button>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Resident</th>
                  <th className="px-4 py-3">
                    {tab.kind === "pregnancy"
                      ? "Expected delivery"
                      : "Birth date"}
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 font-semibold">
                      {record.pregnancy_number ?? record.child_number}
                    </td>
                    <td className="px-4 py-3">
                      <p>{record.resident_name ?? record.child_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {record.resident_number}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {record.estimated_delivery_date ?? record.birth_date}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {record.status ??
                          (record.has_due_immunization ? "Due" : "Active")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedId(record.id)}
                      >
                        <Eye /> View
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

      <MaternalChildFormDialog
        key={formKind}
        open={Boolean(formKind)}
        onOpenChange={(next) => !next && setFormKind(null)}
        kind={formKind ?? "pregnancy"}
      />
      <MaternalChildDetailDialog
        open={Boolean(selectedId)}
        onOpenChange={(next) => !next && setSelectedId(null)}
        kind={tab.kind}
        recordId={selectedId}
        section={tab.id}
      />
    </ContentContainer>
  );
}
