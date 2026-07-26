import { ChevronLeft, ChevronRight, Search, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppointmentResidentSearch } from "@/features/appointments/hooks";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";
import { formatPersonName } from "@/features/registry/formatters";

const PAGE_SIZE = 8;

export function AppointmentResidentField({
  value,
  selected,
  onChange,
  disabled,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debounced = useDebouncedValue(search.trim(), 300);
  const query = useAppointmentResidentSearch(
    { search: debounced, page, pageSize: PAGE_SIZE },
    !disabled && !value,
  );
  useEffect(() => setPage(1), [debounced]);
  const totalPages = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / PAGE_SIZE),
  );

  if (value && selected) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
        <div className="min-w-0">
          <p className="font-semibold">{formatPersonName(selected)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.resident_number} ·{" "}
            {selected.purok_name ?? selected.purok?.name}
          </p>
        </div>
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear selected resident"
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
          placeholder="Search resident number or name"
          className="pl-9"
          aria-label="Search active residents"
          disabled={disabled}
        />
      </div>
      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">Searching residents…</p>
      ) : query.isError ? (
        <p className="text-xs text-destructive">{query.error.message}</p>
      ) : (query.data?.items ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No active residents match.
        </p>
      ) : (
        <div className="space-y-1">
          {query.data.items.map((resident) => (
            <button
              key={resident.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChange(resident)}
            >
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {formatPersonName(resident)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {resident.resident_number} · {resident.age_years} years ·{" "}
                  {resident.purok_name}
                </span>
              </span>
            </button>
          ))}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous resident results"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next resident results"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
