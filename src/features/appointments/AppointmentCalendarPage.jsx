import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  APPOINTMENT_STATUS_LABELS,
  PRIORITY_LABELS,
} from "@/features/appointments/constants";
import { AppointmentDetailDialog } from "@/features/appointments/AppointmentDetailDialog";
import { AppointmentTabs } from "@/features/appointments/AppointmentTabs";
import { useAppointmentCalendar } from "@/features/appointments/hooks";
import {
  formatManilaDate,
  formatManilaTime,
  manilaDateKey,
  monthGridRange,
} from "@/features/appointments/timezone";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shiftMonth(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
}

function monthTitle(monthKey) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${monthKey}-01T00:00:00Z`));
}

function dateKeys(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function CalendarItem({ item, onOpen, compact = false }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="w-full rounded-lg border bg-background p-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`View ${item.appointment_number}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold">
          {formatManilaTime(item.start_time)}
        </span>
        {!compact ? (
          <Badge
            variant={item.priority === "urgent" ? "destructive" : "secondary"}
          >
            {PRIORITY_LABELS[item.priority]}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 truncate text-xs">{item.service_type}</p>
      {!compact ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {item.staff_name || "Unassigned"}
        </p>
      ) : null}
    </button>
  );
}

export default function AppointmentCalendarPage() {
  const today = manilaDateKey();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [detailId, setDetailId] = useState(null);
  const range = useMemo(() => monthGridRange(month), [month]);
  const days = useMemo(() => dateKeys(range.from, range.to), [range]);
  const query = useAppointmentCalendar({
    dateFrom: range.from,
    dateTo: range.to,
  });
  const byDate = useMemo(
    () =>
      (query.data ?? []).reduce((result, item) => {
        result[item.scheduled_date] = [
          ...(result[item.scheduled_date] ?? []),
          item,
        ];
        return result;
      }, {}),
    [query.data],
  );
  const selectedItems = byDate[selectedDate] ?? [];

  function changeMonth(amount) {
    const next = shiftMonth(month, amount);
    setMonth(next);
    setSelectedDate(`${next}-01`);
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Scheduling"
        title="Appointment calendar"
        description="A minimal operational calendar. Resident reasons are intentionally excluded from this overview."
      />
      <AppointmentTabs />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-semibold">
                {monthTitle(month)}
              </h2>
              <p className="text-xs text-muted-foreground">
                Asia/Manila timezone
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelectedDate(today);
                }}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          {query.isLoading ? (
            <LoadingState
              title="Loading calendar"
              description="Retrieving your authorized appointment schedule."
            />
          ) : query.isError ? (
            <ErrorState
              title="Calendar could not be loaded"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : (
            <>
              <div className="hidden lg:block">
                <div className="grid grid-cols-7 border-b text-center text-xs font-medium text-muted-foreground">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="p-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-b border-l">
                  {days.map((date) => {
                    const currentMonth = date.startsWith(month);
                    const items = byDate[date] ?? [];
                    return (
                      <div
                        key={date}
                        className={`min-h-36 border-r border-t p-2 ${
                          currentMonth ? "bg-card" : "bg-muted/30"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDate(date)}
                          aria-label={formatManilaDate(date)}
                          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                            date === today
                              ? "bg-primary text-primary-foreground"
                              : date === selectedDate
                                ? "bg-secondary"
                                : ""
                          }`}
                        >
                          {Number(date.slice(-2))}
                        </button>
                        <div className="mt-2 space-y-1.5">
                          {items.slice(0, 3).map((item) => (
                            <CalendarItem
                              key={item.id}
                              item={item}
                              onOpen={setDetailId}
                              compact
                            />
                          ))}
                          {items.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => setSelectedDate(date)}
                              className="w-full text-center text-xs font-medium text-primary"
                            >
                              +{items.length - 3} more
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:hidden">
                <label
                  htmlFor="calendar-selected-date"
                  className="text-sm font-medium"
                >
                  Agenda date
                </label>
                <input
                  id="calendar-selected-date"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setMonth(event.target.value.slice(0, 7));
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
              </div>

              <section className="space-y-3" aria-label="Selected day agenda">
                <div>
                  <h3 className="font-heading font-semibold">
                    {formatManilaDate(selectedDate)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedItems.length} appointment
                    {selectedItems.length === 1 ? "" : "s"}
                  </p>
                </div>
                {selectedItems.length ? (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {selectedItems.map((item) => (
                      <div key={item.id} className="space-y-2">
                        <CalendarItem item={item} onOpen={setDetailId} />
                        <StatusBadge
                          status={APPOINTMENT_STATUS_LABELS[item.status]}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    title="No appointments on this date"
                    description="Choose another day to view its agenda."
                  />
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <AppointmentDetailDialog
        appointmentId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      />
    </div>
  );
}
