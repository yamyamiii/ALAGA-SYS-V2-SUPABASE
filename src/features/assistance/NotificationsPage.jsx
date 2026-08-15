import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeading } from "@/components/common/PageHeading";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NOTIFICATION_LABELS } from "@/features/assistance/constants";
import {
  useAssistanceMutation,
  useNotifications,
} from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { NotificationPreferencesCard } from "@/features/notifications/NotificationPreferencesCard";
import { resolveNotificationDestination } from "@/features/notifications/navigation";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { formatManilaDateTime } from "@/lib/dateTime";
import { assistanceService } from "@/services/assistanceService";

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [filters, setFilters] = useState({
    unread_only: false,
    page: 1,
    page_size: 20,
  });
  const query = useNotifications(filters);
  const read = useAssistanceMutation(assistanceService.markNotificationRead);
  const readAll = useAssistanceMutation(
    assistanceService.markAllNotificationsRead,
  );

  const activate = (item) => {
    if (!item.read_at) {
      read.mutate(item.id, {
        onError: (error) => {
          toast.error("Notification could not be updated", {
            description: error.message,
          });
        },
      });
    }
    const destination = resolveNotificationDestination(item, can);
    if (destination) navigate(destination);
  };

  const activationLabel = (item) => {
    const hasDestination = Boolean(resolveNotificationDestination(item, can));
    if (!hasDestination) {
      return `${item.read_at ? "View" : "Mark as read"} notification: ${item.title}`;
    }
    return `${item.read_at ? "Open" : "Read and open"} notification: ${item.title}`;
  };

  const markAll = async () => {
    try {
      await readAll.mutateAsync();
      toast.success("All notifications marked as read");
    } catch (error) {
      toast.error("Notifications could not be updated", {
        description: error.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="In-app updates"
        title="Notifications"
        description="Concise updates relevant to your account. Notifications never include diagnoses, treatment plans, or clinical notes."
        actions={
          <Button
            variant="outline"
            onClick={markAll}
            disabled={readAll.isPending || !query.data?.unread}
          >
            <CheckCheck />
            Mark all as read
          </Button>
        }
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.unread_only}
            onChange={(event) =>
              setFilters((value) => ({
                ...value,
                unread_only: event.target.checked,
                page: 1,
              }))
            }
          />
          Unread only
        </label>
        <Badge variant="secondary">{query.data?.unread ?? 0} unread</Badge>
      </div>
      <NotificationPreferencesCard />
      <Card>
        {query.isLoading ? (
          <LoadingState title="Loading notifications" />
        ) : query.isError ? (
          <ErrorState
            title="Notifications unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="There are no notifications in this view."
          />
        ) : (
          <div className="divide-y">
            {query.data.items.map((item) => (
              <article key={item.id}>
                <button
                  type="button"
                  className={`group flex min-h-11 w-full gap-3 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:p-5 ${item.read_at ? "" : "bg-primary/5"}`}
                  onClick={() => activate(item)}
                  aria-label={activationLabel(item)}
                >
                  <Bell
                    aria-hidden="true"
                    className="mt-1 h-5 w-5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{item.title}</span>
                      {!item.read_at ? (
                        <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                          New
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {item.summary}
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {NOTIFICATION_LABELS[item.notification_type] ??
                        item.notification_type}{" "}
                      · {formatManilaDateTime(item.available_at)}
                    </span>
                  </span>
                </button>
              </article>
            ))}
          </div>
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
