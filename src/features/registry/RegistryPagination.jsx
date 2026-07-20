import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PAGE_SIZES } from "@/features/registry/constants";

export function RegistryPagination({ page, pageSize, total, onChange }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        {total === 0 ? "No records" : `${first}–${last} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          <span className="sr-only sm:not-sr-only">Rows</span>
          <select
            value={pageSize}
            onChange={(event) =>
              onChange({ page: 1, page_size: Number(event.target.value) })
            }
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground"
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <span className="min-w-20 text-center text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange({ page: page - 1 })}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onChange({ page: page + 1 })}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
