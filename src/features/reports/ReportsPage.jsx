import {
  Activity,
  Baby,
  CalendarCheck,
  Download,
  HeartPulse,
  Printer,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  ErrorState,
  LoadingState,
  EmptyState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { StatCard } from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/authContext";
import { usePuroks } from "@/features/registry/hooks";
import { AccessibleBarChart } from "@/features/reports/AccessibleBarChart";
import {
  categoriesForRole,
  REPORT_FORMATS,
} from "@/features/reports/constants";
import { ReportFilters } from "@/features/reports/ReportFilters";
import {
  initialReportFilters,
  validateReportFilters,
} from "@/features/reports/schemas";
import { useReport } from "@/features/reports/hooks";
import { reportService } from "@/services/reportService";
import { cn } from "@/lib/utils";

const iconByCategory = {
  overview: Activity,
  residents: UsersRound,
  appointments: CalendarCheck,
  health_records: HeartPulse,
  maternal_care: HeartPulse,
  child_care: Baby,
  staff_workload: UsersRound,
};

function labelFor(key) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scalarEntries(summary = {}) {
  return Object.entries(summary)
    .filter(([, value]) => typeof value !== "object")
    .map(([key, value]) => ({ key, label: labelFor(key), value }));
}

function objectChart(summary, key) {
  return Object.entries(summary?.[key] ?? {}).map(([label, value]) => ({
    label: labelFor(label),
    value,
  }));
}

function Summary({ category, data, loading }) {
  const Icon = iconByCategory[category] ?? Activity;
  const entries = scalarEntries(data?.summary);
  if (category === "staff_workload") {
    const rows = data?.workload ?? [];
    return rows.length ? (
      <Card>
        <CardHeader>
          <CardTitle>Operational volume by staff member</CardTitle>
          <p className="text-sm text-muted-foreground">
            Counts describe workload only and are not a performance score.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b">
                {[
                  "Staff",
                  "Role",
                  "Assigned",
                  "Completed",
                  "Encounters",
                  "Maternal/child",
                  "Total",
                ].map((heading) => (
                  <th key={heading} scope="col" className="px-3 py-2">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.staff_id} className="border-b last:border-0">
                  <td className="px-3 py-3 font-medium">{row.staff_name}</td>
                  <td className="px-3 py-3">{labelFor(row.role)}</td>
                  <td className="px-3 py-3">{row.assigned_appointments}</td>
                  <td className="px-3 py-3">{row.completed_appointments}</td>
                  <td className="px-3 py-3">{row.clinical_encounters}</td>
                  <td className="px-3 py-3">{row.maternal_child_events}</td>
                  <td className="px-3 py-3 font-semibold">
                    {row.total_volume}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    ) : null;
  }
  const charts = [];
  if (data?.byPurok) charts.push(["Residents by purok", data.byPurok]);
  if (data?.byAge) charts.push(["Residents by age group", data.byAge]);
  if (data?.services) charts.push(["Services distribution", data.services]);
  if (data?.overTime) {
    charts.push([
      "Appointments over time",
      data.overTime.map((row) => ({
        label: row.period_date,
        value: row.value,
      })),
    ]);
  }
  for (const key of [
    "status_counts",
    "priority_counts",
    "type_counts",
    "outcome_counts",
    "immunization_status_counts",
  ]) {
    const chart = objectChart(data?.summary, key);
    if (chart.length) charts.push([labelFor(key), chart]);
  }
  return (
    <div className="space-y-6">
      {entries.length ? (
        <section
          aria-label="Report totals"
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {entries.map((entry) => (
            <StatCard
              key={entry.key}
              label={entry.label}
              value={entry.value}
              icon={Icon}
              loading={loading}
              helper="Authorized aggregate"
            />
          ))}
        </section>
      ) : null}
      {charts.length ? (
        <section className="grid gap-6 xl:grid-cols-2">
          {charts.map(([title, chart]) => (
            <AccessibleBarChart key={title} title={title} data={chart} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const { profile } = useAuth();
  const categories = useMemo(
    () => categoriesForRole(profile.role),
    [profile.role],
  );
  const [category, setCategory] = useState(categories[0]?.id ?? "");
  const [draft, setDraft] = useState(() => initialReportFilters());
  const [filters, setFilters] = useState(() => initialReportFilters());
  const [filterError, setFilterError] = useState("");
  const [exporting, setExporting] = useState("");
  const [exportError, setExportError] = useState("");
  const puroks = usePuroks();
  const query = useReport(category, filters, Boolean(category));
  const categoryLabel =
    categories.find((item) => item.id === category)?.label ?? "Report";
  const showPurok = !["overview", "staff_workload"].includes(category);
  const showAppointmentFilters = ["appointments", "staff_workload"].includes(
    category,
  );
  const showStaff = [
    "appointments",
    "health_records",
    "staff_workload",
  ].includes(category);

  const applyFilters = () => {
    const result = validateReportFilters(draft);
    setFilterError(result.error ?? "");
    if (result.data) setFilters(result.data);
  };
  const reset = () => {
    const next = initialReportFilters();
    setDraft(next);
    setFilters(next);
    setFilterError("");
  };
  const changeCategory = (nextCategory) => {
    const nextFilters = {
      ...filters,
      purok_id: "",
      service_type: "",
      status: "",
      staff_id: "",
    };
    setCategory(nextCategory);
    setDraft(nextFilters);
    setFilters(nextFilters);
    setFilterError("");
    setExportError("");
  };
  const exportReport = async (format) => {
    setExporting(format);
    setExportError("");
    try {
      const result = await reportService.exportRows(category, filters, format);
      if (format === "print" || format === "pdf") {
        window.print();
      } else {
        const { downloadReport } =
          await import("@/features/reports/exportUtils");
        downloadReport(
          result.rows,
          {
            category,
            startDate: filters.start_date,
            endDate: filters.end_date,
          },
          format,
        );
      }
    } catch (error) {
      setExportError(error.message);
    } finally {
      setExporting("");
    }
  };
  const hasData =
    scalarEntries(query.data?.summary).some(({ value }) => Number(value) > 0) ||
    (query.data?.workload?.length ?? 0) > 0 ||
    (query.data?.byAge?.some(({ value }) => Number(value) > 0) ?? false) ||
    (query.data?.services?.some(({ value }) => Number(value) > 0) ?? false);

  return (
    <div className="report-print space-y-6">
      <PageHeading
        eyebrow="Decision support"
        title="Reports and analytics"
        description="Privacy-safe aggregate views from authorized database records. Filters use the Asia/Manila business date."
        actions={
          <div className="print-hidden flex flex-wrap gap-2">
            {REPORT_FORMATS.map(([format, label]) => (
              <Button
                key={format}
                type="button"
                size="sm"
                variant="outline"
                disabled={Boolean(exporting) || query.isLoading}
                onClick={() => exportReport(format)}
              >
                {format === "print" || format === "pdf" ? (
                  <Printer />
                ) : (
                  <Download />
                )}
                {exporting === format ? "Preparing…" : label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="print-only hidden text-sm">
        <p className="font-semibold">ALAGA-SYS · Brgy. Bagongpook</p>
        <p>Report: {categoryLabel}</p>
        <p>
          Reporting period: {filters.start_date} to {filters.end_date}
        </p>
        <p>
          Generated in Asia/Manila:{" "}
          {new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Manila",
          }).format(new Date())}
        </p>
      </div>

      <nav
        aria-label="Report categories"
        className="print-hidden flex gap-2 overflow-x-auto pb-1"
      >
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => changeCategory(item.id)}
            className={cn(
              "h-10 shrink-0 rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              category === item.id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-accent",
            )}
            aria-current={category === item.id ? "page" : undefined}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <ReportFilters
        value={draft}
        onChange={setDraft}
        onApply={applyFilters}
        onReset={reset}
        puroks={puroks.data ?? []}
        error={
          filterError ||
          (showPurok && puroks.isError ? puroks.error.message : "")
        }
        showPurok={showPurok}
        showAppointmentFilters={showAppointmentFilters}
        showStaff={showStaff}
      />

      <div className="flex items-center justify-between border-b pb-3">
        <h2 className="text-lg font-semibold">{categoryLabel}</h2>
        <p className="text-xs text-muted-foreground">
          {filters.start_date} to {filters.end_date}
        </p>
      </div>

      {exportError ? (
        <p role="alert" className="text-sm text-destructive">
          {exportError}
        </p>
      ) : null}
      {query.isLoading ? (
        <LoadingState
          title="Loading report"
          description="Aggregating authorized records…"
        />
      ) : query.isError ? (
        <ErrorState
          title={
            query.error.code === "permission_denied"
              ? "Report access denied"
              : "Report unavailable"
          }
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : !hasData ? (
        <EmptyState
          title="No report data"
          description="No authorized records match the selected date range and filters."
        />
      ) : (
        <Summary
          category={category}
          data={query.data}
          loading={query.isFetching}
        />
      )}
      <footer className="print-only hidden border-t pt-3 text-xs">
        Privacy-safe operational report · ALAGA-SYS · Page generated for
        authorized use
      </footer>
    </div>
  );
}
