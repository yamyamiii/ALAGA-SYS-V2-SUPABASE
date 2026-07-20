import { ChevronLeft, ChevronRight, Home, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHouseholdSearch } from "@/features/registry/hooks";
import { useDebouncedValue } from "@/features/registry/useDebouncedValue";

const PAGE_SIZE = 8;

export function HouseholdSearchField({
  purokId,
  value,
  selectedHousehold,
  onChange,
  disabled = false,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const query = useHouseholdSearch(
    {
      purokId,
      search: debouncedSearch,
      page,
      pageSize: PAGE_SIZE,
    },
    !disabled,
  );

  useEffect(() => setPage(1), [debouncedSearch, purokId]);
  const totalPages = Math.max(
    1,
    Math.ceil((query.data?.total ?? 0) / PAGE_SIZE),
  );

  if (value && selectedHousehold) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">
              {selectedHousehold.household_number}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedHousehold.address_line || "No address recorded"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear household assignment"
            onClick={() => onChange(null)}
            disabled={disabled}
          >
            <X />
          </Button>
        </div>
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
          placeholder="Search number, head, or address"
          className="pl-9"
          disabled={disabled || !purokId}
          aria-label="Search households"
        />
      </div>
      {!purokId ? (
        <p className="text-xs text-muted-foreground">Select a purok first.</p>
      ) : query.isError ? (
        <p className="text-xs text-destructive">{query.error.message}</p>
      ) : query.isLoading ? (
        <p className="text-xs text-muted-foreground">Searching households…</p>
      ) : (query.data?.items ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No current household matches.
        </p>
      ) : (
        <div className="space-y-1">
          {query.data.items.map((household) => (
            <button
              key={household.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChange(household)}
            >
              <Home className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block font-semibold">
                  {household.household_number}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {household.head_name ? `Head: ${household.head_name} · ` : ""}
                  {household.purok_name} ·{" "}
                  {household.address_line || "No address recorded"}
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
                  onClick={() => setPage((current) => current - 1)}
                  disabled={page <= 1}
                  aria-label="Previous household results"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next household results"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange(null)}
        disabled={disabled}
      >
        No household
      </Button>
    </div>
  );
}
