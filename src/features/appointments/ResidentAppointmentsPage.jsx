import { CalendarPlus, Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { EmptyState, ErrorState } from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  APPOINTMENT_STATUS_LABELS,
  INITIAL_APPOINTMENT_FILTERS,
} from "@/features/appointments/constants";
import { AppointmentDetailDialog } from "@/features/appointments/AppointmentDetailDialog";
import { AppointmentTabs } from "@/features/appointments/AppointmentTabs";
import { useAppointments } from "@/features/appointments/hooks";
import { ResidentAppointmentRequestDialog } from "@/features/appointments/ResidentAppointmentRequestDialog";
import {
  formatManilaDate,
  formatManilaTime,
} from "@/features/appointments/timezone";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { RegistrySkeleton } from "@/features/registry/RegistrySkeleton";
import {
  APPOINTMENT_REQUEST_FORM_ACTION,
  consumeAiUiAction,
} from "@/features/ai-assistant/uiActions";

export function ResidentAppointmentsPage({ profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const filters = useMemo(
    () => ({
      ...INITIAL_APPOINTMENT_FILTERS,
      direction: "desc",
      page,
      page_size: 10,
    }),
    [page],
  );
  const query = useAppointments(filters);
  const items = query.data?.items ?? [];

  useEffect(() => {
    const token = location.state?.alagaAiUiActionToken;
    if (!token) return;
    const actionId = consumeAiUiAction(token, profile.role);
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      { replace: true, state: null },
    );
    if (actionId === APPOINTMENT_REQUEST_FORM_ACTION) {
      setRequestOpen(true);
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
    profile.role,
  ]);

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="My healthcare"
        title="My appointments"
        description="Book an available service slot and follow its status. Standard self-bookings are confirmed automatically after secure availability checks."
        actions={
          <Button type="button" onClick={() => setRequestOpen(true)}>
            <CalendarPlus /> Book appointment
          </Button>
        }
      />
      <AppointmentTabs />

      <div
        className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"
        role="status"
      >
        <p className="font-semibold">Routine bookings are automatic</p>
        <p className="mt-1 text-muted-foreground">
          Choose a service, then select only dates and times with current staff
          capacity. The database assigns eligible staff and confirms a valid
          booking immediately. Coordination-required services are clearly
          identified before booking.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          {query.isLoading ? (
            <RegistrySkeleton />
          ) : query.isError ? (
            <ErrorState
              title="Your appointments could not be loaded"
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="No appointments yet"
              description="Book your first available appointment when you need assistance from the health center."
              actionLabel="Book appointment"
              onAction={() => setRequestOpen(true)}
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((appointment) => (
                  <article
                    key={appointment.id}
                    className="flex h-full flex-col rounded-xl border p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-heading font-semibold">
                          {appointment.appointment_number}
                        </p>
                        <p className="mt-1 text-sm">
                          {appointment.service_type}
                        </p>
                      </div>
                      <StatusBadge
                        status={APPOINTMENT_STATUS_LABELS[appointment.status]}
                      />
                    </div>

                    <div className="mt-4 space-y-1 text-sm">
                      <p>{formatManilaDate(appointment.scheduled_date)}</p>
                      <p className="text-muted-foreground">
                        {formatManilaTime(appointment.start_time)}–
                        {formatManilaTime(appointment.end_time)}
                      </p>
                    </div>

                    {appointment.status === "pending" ? (
                      <Badge variant="secondary" className="mt-4 w-fit">
                        Awaiting health-center confirmation
                      </Badge>
                    ) : null}

                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailId(appointment.id)}
                      >
                        <Eye /> View details
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              <RegistryPagination
                page={page}
                pageSize={10}
                total={query.data.total}
                onChange={(next) => setPage(next.page ?? 1)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <ResidentAppointmentRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        onSaved={() => setPage(1)}
      />
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
