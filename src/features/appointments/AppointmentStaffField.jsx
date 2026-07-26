import { Search, Stethoscope, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppointmentStaffSearch } from "@/features/appointments/hooks";
import { getRoleLabel } from "@/features/auth/permissions";
import { formatPersonName } from "@/features/registry/formatters";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";

export function AppointmentStaffField({
  value,
  selected,
  serviceType,
  onChange,
  disabled,
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 300);
  const query = useAppointmentStaffSearch(
    { search: debounced, serviceType, page: 1, pageSize: 10 },
    !disabled && !value && Boolean(serviceType),
  );

  if (value && selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
        <div>
          <p className="font-semibold">{formatPersonName(selected)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getRoleLabel(selected.role)}
          </p>
        </div>
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear staff assignment"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search eligible staff"
          className="pl-9"
          aria-label="Search eligible appointment staff"
          disabled={disabled || !serviceType}
        />
      </div>
      {!serviceType ? (
        <p className="text-xs text-muted-foreground">Select a service first.</p>
      ) : query.isLoading ? (
        <p className="text-xs text-muted-foreground">Searching staff…</p>
      ) : query.isError ? (
        <p className="text-xs text-destructive">{query.error.message}</p>
      ) : (query.data?.items ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No eligible staff match.
        </p>
      ) : (
        <div className="space-y-1">
          {query.data.items.map((staff) => (
            <button
              key={staff.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChange(staff)}
            >
              <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className="block text-sm font-semibold">
                  {formatPersonName(staff)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {getRoleLabel(staff.role)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(null)}
        disabled={disabled}
      >
        Leave unassigned
      </Button>
    </div>
  );
}
