import { Filter, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  SERVICE_TYPES,
} from "@/features/appointments/constants";
import { QUICK_RANGES } from "@/features/reports/constants";
import { quickRange } from "@/features/reports/schemas";
import { ReportStaffFilter } from "@/features/reports/ReportStaffFilter";

function Field({ label, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function ReportFilters({
  value,
  onChange,
  onApply,
  onReset,
  puroks = [],
  error,
  showAppointmentFilters,
  showPurok,
  showStaff,
}) {
  const set = (field, next) => onChange({ ...value, [field]: next });
  return (
    <section
      aria-label="Report filters"
      className="print-hidden rounded-xl border bg-card p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap gap-2">
        {QUICK_RANGES.map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange({ ...value, ...quickRange(key) })}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="Start date" htmlFor="report-start-date">
          <Input
            id="report-start-date"
            type="date"
            value={value.start_date}
            onChange={(event) => set("start_date", event.target.value)}
          />
        </Field>
        <Field label="End date" htmlFor="report-end-date">
          <Input
            id="report-end-date"
            type="date"
            value={value.end_date}
            onChange={(event) => set("end_date", event.target.value)}
          />
        </Field>
        {showPurok ? (
          <Field label="Purok" htmlFor="report-purok">
            <select
              id="report-purok"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={value.purok_id}
              onChange={(event) => set("purok_id", event.target.value)}
            >
              <option value="">All active puroks</option>
              {puroks.map((purok) => (
                <option key={purok.id} value={purok.id}>
                  {purok.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {showAppointmentFilters ? (
          <>
            <Field label="Service" htmlFor="report-service">
              <select
                id="report-service"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                value={value.service_type}
                onChange={(event) => set("service_type", event.target.value)}
              >
                <option value="">All services</option>
                {SERVICE_TYPES.map((service) => (
                  <option key={service}>{service}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Appointment status"
              htmlFor="report-appointment-status"
            >
              <select
                id="report-appointment-status"
                className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                value={value.status}
                onChange={(event) => set("status", event.target.value)}
              >
                <option value="">All statuses</option>
                {APPOINTMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {APPOINTMENT_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        {showStaff ? (
          <ReportStaffFilter
            value={value.staff_id}
            serviceType={value.service_type}
            onChange={(staffId) => set("staff_id", staffId)}
          />
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" onClick={onApply}>
          <Filter />
          Apply filters
        </Button>
        <Button type="button" variant="ghost" onClick={onReset}>
          <RotateCcw />
          Reset
        </Button>
      </div>
    </section>
  );
}
