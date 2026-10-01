import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth/authContext";
import { useHealthEventReport } from "./hooks";

export function HealthEventSummary({ from, to }) {
  const { profile } = useAuth();
  const query = useHealthEventReport(from, to);
  if (profile?.role === "resident")
    return (
      <Link
        className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        to={ROUTES.healthEvents}
      >
        Browse health service events
      </Link>
    );
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-semibold">
            Health service events · {from} to {to}
          </h2>
          <Link className="text-sm underline" to={ROUTES.healthEvents}>
            Open events
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Separate date-range campaign aggregates; ordinary appointment totals
          are unchanged. Other ordinary report filters do not apply here.
          Clinical staff counts show only their assignments.
        </p>
        {query.isLoading ? (
          <LoadingState compact title="Loading event aggregates" />
        ) : query.isError ? (
          <ErrorState
            compact
            title="Event aggregates unavailable"
            description={query.error.message}
            actionLabel="Retry"
            onAction={() => query.refetch()}
          />
        ) : !query.data?.length ? (
          <p className="text-sm">No events in this period.</p>
        ) : (
          query.data.map((event) => (
            <div key={event.id} className="rounded-lg border p-3 text-sm">
              <h3 className="font-medium">
                {event.title} · {event.date} · {event.status}
              </h3>
              <p>
                Target {event.capacity} · Booked {event.booked} ·{" "}
                {event.waitlisted !== null
                  ? `Waitlisted ${event.waitlisted} · `
                  : ""}
                Cancelled {event.cancelled} · Attended {event.attended} ·
                Completed {event.completed}
              </p>
              <ul>
                {(event.staff ?? []).map((s, i) => (
                  <li key={i}>
                    {s.name}: {s.assigned} / {s.quota}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
