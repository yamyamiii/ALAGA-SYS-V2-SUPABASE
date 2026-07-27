import { Search, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppointmentStaffSearch } from "@/features/appointments/hooks";
import { getRoleLabel } from "@/features/auth/permissions";
import { formatPersonName } from "@/features/registry/formatters";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";

export function ReportStaffFilter({ value, onChange, serviceType }) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const query = useAppointmentStaffSearch(
    { search: debounced, serviceType, page: 1, pageSize: 10 },
    !value,
  );

  if (value && selected?.id === value) {
    return (
      <div className="space-y-1.5">
        <Label>Staff</Label>
        <div className="flex h-10 items-center justify-between rounded-lg border bg-background px-3">
          <span className="truncate text-sm">
            {formatPersonName(selected)} · {getRoleLabel(selected.role)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Clear staff filter"
            onClick={() => {
              setSelected(null);
              onChange("");
            }}
          >
            <X />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="report-staff-search">Staff</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          id="report-staff-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="All staff or search"
          className="pl-9"
        />
      </div>
      {search || debounced ? (
        <div className="max-h-44 overflow-y-auto rounded-lg border bg-background p-1">
          {query.isLoading ? (
            <p className="p-2 text-xs text-muted-foreground">Searching…</p>
          ) : query.isError ? (
            <p className="p-2 text-xs text-destructive">
              {query.error.message}
            </p>
          ) : (query.data?.items ?? []).length ? (
            query.data.items.map((staff) => (
              <button
                key={staff.id}
                type="button"
                className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setSelected(staff);
                  setSearch("");
                  onChange(staff.id);
                }}
              >
                <span className="block font-medium">
                  {formatPersonName(staff)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getRoleLabel(staff.role)}
                </span>
              </button>
            ))
          ) : (
            <p className="p-2 text-xs text-muted-foreground">No staff match.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
