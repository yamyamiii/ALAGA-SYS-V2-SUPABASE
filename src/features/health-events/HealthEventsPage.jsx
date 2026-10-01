import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ROUTES } from "@/config/routes";
import { toast } from "sonner";
import { PageHeading } from "@/components/common/PageHeading";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/authContext";
import { AppointmentTabs } from "@/features/appointments/AppointmentTabs";
import {
  formatManilaDate,
  formatManilaTime,
  manilaDateKey,
} from "@/features/appointments/timezone";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { healthEventService } from "@/services/healthEventService";
import { HealthEventFormDialog } from "./HealthEventFormDialog";
import {
  useHealthEvents,
  useHealthEventHistory,
  useHealthEventMutation,
  useHealthEventQueue,
} from "./hooks";

function EventQueue({ event }) {
  const query = useHealthEventQueue(event.id);
  const mutation = useHealthEventMutation(({ booking, action }) =>
    healthEventService.transition(booking, action),
  );
  const operate = async (booking, action) => {
    try {
      await mutation.mutateAsync({ booking, action });
      toast.success("Event queue updated");
    } catch (error) {
      toast.error(error.message);
    }
  };
  return (
    <section className="mt-4 space-y-3" aria-label="Assigned event queue">
      <h3 className="font-semibold">
        Event queue · authorized participants only
      </h3>
      {query.isLoading ? (
        <LoadingState compact title="Loading event queue" />
      ) : query.isError ? (
        <ErrorState
          compact
          title="Queue unavailable"
          description={query.error.message}
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      ) : (query.data ?? []).length === 0 ? (
        <p>No assigned participants.</p>
      ) : (
        query.data.map((b) => (
          <div
            key={b.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div>
              <p>
                #{b.queue_order} · {b.resident_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.resident_number} · {b.reference} · {b.state} ·{" "}
                {b.assigned_staff || "Staff assignment needs attention"}
              </p>
            </div>
            {event.event_date === manilaDateKey(new Date()) &&
            event.status !== "cancelled" &&
            !event.archived_at &&
            ["confirmed", "checked_in"].includes(b.state) ? (
              <Button
                disabled={mutation.isPending}
                onClick={() =>
                  operate(b, b.state === "confirmed" ? "check_in" : "complete")
                }
              >
                {b.state === "confirmed" ? "Check in" : "Complete"}
              </Button>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}
function EventHistory({ id }) {
  const query = useHealthEventHistory(id);
  return (
    <section className="mt-4" aria-label="Event history">
      <h3 className="font-semibold">History</h3>
      {query.isError ? (
        <ErrorState
          compact
          title="History unavailable"
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      ) : query.isLoading ? (
        <p>Loading history…</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {(query.data ?? []).map((h, i) => (
            <li key={i}>
              {h.action.replace("health_event.", "").replaceAll("_", " ")} ·{" "}
              {new Intl.DateTimeFormat("en-PH", {
                timeZone: "Asia/Manila",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(h.occurred_at))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
export default function HealthEventsPage() {
  const { profile } = useAuth();
  const manager = ["admin", "barangay_health_worker"].includes(profile?.role);
  const resident = profile?.role === "resident";
  const [parameters] = useSearchParams();
  const [filters, setFilters] = useState({
    page: 1,
    page_size: 20,
    include_archived: false,
  });
  const requestedId = parameters.get("event");
  const eventId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedId ?? "",
    )
      ? requestedId
      : null;
  const query = useHealthEvents({
    ...filters,
    ...(eventId ? { event_id: eventId, page: 1 } : {}),
  });
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [queue, setQueue] = useState(null);
  const [history, setHistory] = useState(null);
  const [action, setAction] = useState(null);
  const key = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const mutation = useHealthEventMutation(async ({ event, type }) =>
    type === "book" || type === "waitlist"
      ? healthEventService.book(event.id, key.current, type === "waitlist")
      : type === "cancel_booking"
        ? healthEventService.cancelBooking(event.own_booking, null)
        : healthEventService.setStatus(event, type),
  );
  const confirm = async () => {
    if (!action || submitting.current) return;
    submitting.current = true;
    try {
      const result = await mutation.mutateAsync(action);
      toast.success(
        result?.state === "waitlisted"
          ? "You joined the waitlist"
          : result?.state === "confirmed"
            ? "Event booking confirmed"
            : "Event updated",
      );
      setAction(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      submitting.current = false;
    }
  };
  const choose = (event, type) => {
    key.current = crypto.randomUUID();
    mutation.reset();
    setAction({ event, type });
  };
  return (
    <div className="space-y-6">
      <PageHeading
        title="Health service events"
        description="Fixed-window Barangay campaigns · capacity-based queues · Asia/Manila time"
        actions={
          manager ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Create health service event
            </Button>
          ) : null
        }
      />
      <AppointmentTabs />
      {eventId ? (
        <Button asChild variant="outline">
          <Link to={ROUTES.healthEvents}>Show all events</Link>
        </Button>
      ) : null}
      {manager ? (
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={filters.include_archived}
            onChange={(e) =>
              setFilters((v) => ({
                ...v,
                page: 1,
                include_archived: e.target.checked,
              }))
            }
          />
          Show archived events
        </label>
      ) : null}
      {query.isLoading ? (
        <LoadingState title="Loading health service events" />
      ) : query.isError ? (
        <ErrorState
          title="Events unavailable"
          description={query.error.message}
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      ) : !query.data?.items.length ? (
        <EmptyState
          title="No health service events"
          description="Published campaigns will appear here."
        />
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          {query.data.items.map((event) => {
            const own = event.own_booking;
            const active =
              event.booking_open !== false &&
              event.status === "published" &&
              !event.archived_at &&
              new Date(event.booking_closes_at) > new Date() &&
              new Date(event.booking_opens_at) <= new Date();
            return (
              <Card
                key={event.id}
                className={
                  parameters.get("event") === event.id
                    ? "ring-2 ring-primary"
                    : ""
                }
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap gap-2">
                    <Badge>
                      {event.archived_at ? "Archived" : event.status}
                    </Badge>
                    <Badge variant="outline">{event.service_type}</Badge>
                  </div>
                  <h2 className="text-lg font-semibold">{event.title}</h2>
                  <p className="text-xs text-muted-foreground">
                    {event.reference}
                  </p>
                  <p>
                    {formatManilaDate(event.event_date)} ·{" "}
                    {formatManilaTime(event.start_time)}–
                    {formatManilaTime(event.end_time)} · Asia/Manila
                  </p>
                  <p>
                    {event.booked} of {event.capacity} booked ·{" "}
                    {event.remaining} places remaining
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Attend within the event window. This is a service queue, not
                    an individual consultation time slot.
                  </p>
                  {own ? (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <p>
                        Your booking: {own.state} · {own.reference}
                      </p>
                      <p>Queue/order: {own.queue_order}</p>
                      {own.assigned_staff ? (
                        <p>Assigned service staff: {own.assigned_staff}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {event.exception ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-destructive p-3 text-sm"
                    >
                      Staff unavailable: review the team. Existing bookings are
                      retained, not cancelled.
                    </p>
                  ) : null}
                  {manager ? (
                    <>
                      <p>Waitlisted: {event.waitlisted}</p>
                      <ul className="text-sm">
                        {(event.staff ?? []).map((s) => (
                          <li key={s.id}>
                            {s.name}: {s.assigned} / {s.quota}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {resident &&
                    active &&
                    (!own || own.state === "cancelled") ? (
                      <Button
                        onClick={() =>
                          choose(
                            event,
                            event.remaining > 0 &&
                              event.staff_available !== false
                              ? "book"
                              : "waitlist",
                          )
                        }
                      >
                        {event.remaining > 0 && event.staff_available !== false
                          ? "Book appointment"
                          : "Join waitlist"}
                      </Button>
                    ) : null}
                    {resident &&
                    !event.archived_at &&
                    ["published", "closed"].includes(event.status) &&
                    new Date(event.booking_closes_at) > new Date() &&
                    own &&
                    ["confirmed", "waitlisted"].includes(own.state) ? (
                      <Button
                        variant="outline"
                        onClick={() => choose(event, "cancel_booking")}
                      >
                        Cancel event booking
                      </Button>
                    ) : null}
                    {!resident ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setQueue(queue === event.id ? null : event.id)
                        }
                      >
                        View event queue
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() =>
                        setHistory(history === event.id ? null : event.id)
                      }
                    >
                      View history
                    </Button>
                    {manager &&
                    !event.archived_at &&
                    ["draft", "published"].includes(event.status) ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(event);
                          setFormOpen(true);
                        }}
                      >
                        Edit event
                      </Button>
                    ) : null}
                    {manager &&
                    !event.archived_at &&
                    event.status === "published" ? (
                      <Button
                        variant="outline"
                        onClick={() => choose(event, "close")}
                      >
                        Close bookings
                      </Button>
                    ) : null}
                    {manager &&
                    !event.archived_at &&
                    event.status !== "cancelled" ? (
                      <Button
                        variant="destructive"
                        onClick={() => choose(event, "cancel")}
                      >
                        Cancel event
                      </Button>
                    ) : null}
                    {manager &&
                    !event.archived_at &&
                    ["closed", "cancelled"].includes(event.status) ? (
                      <Button
                        variant="outline"
                        onClick={() => choose(event, "archive")}
                      >
                        Archive event
                      </Button>
                    ) : null}
                  </div>
                  {queue === event.id ? <EventQueue event={event} /> : null}
                  {history === event.id ? <EventHistory id={event.id} /> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <RegistryPagination
        page={eventId ? 1 : filters.page}
        pageSize={filters.page_size}
        total={query.data?.total ?? 0}
        onChange={(change) => setFilters((v) => ({ ...v, ...change }))}
      />
      {manager ? (
        <HealthEventFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          record={editing}
        />
      ) : null}
      <Dialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setAction(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {action?.type === "book"
                ? "Book health service event?"
                : action?.type === "waitlist"
                  ? "Join event waitlist?"
                  : action?.type === "cancel_booking"
                    ? "Cancel your event booking?"
                    : `${action?.type ?? "Update"} health service event?`}
            </DialogTitle>
            <DialogDescription>
              {action?.type === "waitlist"
                ? "A place will be confirmed automatically when capacity and eligible staff become available. No approval is required."
                : action?.type === "cancel"
                  ? "Affected bookings will be cancelled and Residents notified. History is retained."
                  : "The trusted server validates eligibility, capacity, staff allocation and the latest version."}
            </DialogDescription>
          </DialogHeader>
          {mutation.isError ? (
            <p role="alert" className="text-destructive">
              {mutation.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setAction(null)}
            >
              Back
            </Button>
            <Button
              variant={
                action?.type.startsWith("cancel") ? "destructive" : "default"
              }
              disabled={mutation.isPending}
              onClick={confirm}
            >
              {mutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
