import { Activity, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActivity } from "@/features/assistance/hooks";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { formatManilaDateTime } from "@/lib/dateTime";

export default function ActivityPage() {
  const [filters, setFilters] = useState({ page: 1, page_size: 20 });
  const query = useActivity(filters);
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Safe event history"
        title="Activity timeline"
        description="Operational events only. Clinical narratives, diagnoses, treatment plans, notes, and addresses are excluded."
      />
      <Card>
        {query.isLoading ? (
          <LoadingState title="Loading activity" />
        ) : query.isError ? (
          <ErrorState
            title="Activity unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="No authorized activity is available."
          />
        ) : (
          <ol className="divide-y">
            {query.data.items.map((item) => (
              <li key={item.event_id} className="flex gap-4 p-4 sm:p-5">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatManilaDateTime(item.occurred_at)}
                  </p>
                  {item.action_path ? (
                    <Button
                      asChild
                      size="sm"
                      variant="link"
                      className="mt-2 h-auto p-0"
                    >
                      <Link to={item.action_path}>
                        Open related module <ArrowRight />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
        <RegistryPagination
          page={filters.page}
          pageSize={filters.page_size}
          total={query.data?.total ?? 0}
          onChange={(change) =>
            setFilters((value) => ({ ...value, ...change }))
          }
        />
      </Card>
    </div>
  );
}
