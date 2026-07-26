import { Eye } from "lucide-react";
import { useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { APPOINTMENT_STATUS_LABELS } from "@/features/appointments/constants";
import { AppointmentDetailDialog } from "@/features/appointments/AppointmentDetailDialog";
import { useResidentAppointmentHistory } from "@/features/appointments/hooks";
import {
  formatManilaDate,
  formatManilaTime,
} from "@/features/appointments/timezone";
import { RegistryPagination } from "@/features/registry/RegistryPagination";

export function ResidentAppointmentHistory({ residentId }) {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState(null);
  const pageSize = 10;
  const query = useResidentAppointmentHistory(residentId, page);
  const items = query.data?.items ?? [];

  return (
    <>
      <section className="space-y-3 rounded-xl border p-4">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Appointment history
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Scheduling history only. Clinical encounters are outside this
            module.
          </p>
        </div>
        {query.isLoading ? (
          <LoadingState compact title="Loading appointment history" />
        ) : query.isError ? (
          <ErrorState
            compact
            title="Appointment history unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            title="No appointment history"
            description="No authorized scheduling records are available for this resident."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="divide-y">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {item.appointment_number}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatManilaDate(item.scheduled_date)} ·{" "}
                      {formatManilaTime(item.start_time)} · {item.service_type}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.staff_name || "Unassigned"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={APPOINTMENT_STATUS_LABELS[item.status]}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`View ${item.appointment_number}`}
                      onClick={() => setDetailId(item.id)}
                    >
                      <Eye />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <RegistryPagination
              page={page}
              pageSize={pageSize}
              total={query.data.total}
              onChange={(next) => setPage(next.page ?? 1)}
            />
          </div>
        )}
      </section>
      <AppointmentDetailDialog
        appointmentId={detailId}
        open={Boolean(detailId)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      />
    </>
  );
}
