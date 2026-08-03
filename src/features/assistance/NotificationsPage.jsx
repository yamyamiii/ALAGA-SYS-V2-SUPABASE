import { Bell, CheckCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NOTIFICATION_LABELS } from "@/features/assistance/constants";
import {
  useAssistanceMutation,
  useNotifications,
} from "@/features/assistance/hooks";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { assistanceService } from "@/services/assistanceService";
import { NotificationPreferencesCard } from "@/features/notifications/NotificationPreferencesCard";
import { NotificationDeliveryDashboard } from "@/features/notifications/NotificationDeliveryDashboard";
import { useAuth } from "@/features/auth/authContext";
import { USER_ROLES } from "@/features/auth/permissions";
import { formatManilaDateTime } from "@/lib/dateTime";

export default function NotificationsPage() {
  const { profile } = useAuth();
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
  const mark = async (id) => {
    try {
      await read.mutateAsync(id);
    } catch (error) {
      toast.error("Notification could not be updated", {
        description: error.message,
      });
    }
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
            onChange={(e) =>
              setFilters((v) => ({
                ...v,
                unread_only: e.target.checked,
                page: 1,
              }))
            }
          />
          Unread only
        </label>
        <Badge variant="secondary">{query.data?.unread ?? 0} unread</Badge>
      </div>
      <NotificationPreferencesCard />
      <NotificationDeliveryDashboard
        enabled={profile.role === USER_ROLES.ADMINISTRATOR}
      />
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
              <article
                key={item.id}
                className={`flex gap-3 p-4 sm:p-5 ${item.read_at ? "" : "bg-primary/5"}`}
              >
                <Bell className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.title}</h2>
                    {!item.read_at ? <Badge>New</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.summary}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {NOTIFICATION_LABELS[item.notification_type] ??
                      item.notification_type}{" "}
                    · {formatManilaDateTime(item.available_at)}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {item.action_path ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={item.action_path}>Open</Link>
                      </Button>
                    ) : null}
                    {!item.read_at ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => mark(item.id)}
                        disabled={read.isPending}
                      >
                        Mark as read
                      </Button>
                    ) : null}
                  </div>
                </div>
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
