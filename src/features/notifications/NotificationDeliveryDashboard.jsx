import { Clock3, RefreshCw, Send, TriangleAlert, WifiOff } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatManilaDateTime } from "@/lib/dateTime";
import {
  useNotificationDeliverySummary,
  useNotificationSettingsMutation,
} from "@/features/notifications/hooks";
import { notificationService } from "@/services/notificationService";

export function NotificationDeliveryDashboard({ enabled }) {
  const query = useNotificationDeliverySummary(enabled);
  const retry = useNotificationSettingsMutation(
    notificationService.retryFailedJob,
  );
  if (!enabled) return null;
  if (query.isLoading) return <LoadingState title="Loading delivery status" />;
  if (query.isError) {
    return (
      <ErrorState
        title="Delivery status unavailable"
        description={query.error.message}
        actionLabel="Try again"
        onAction={() => query.refetch()}
      />
    );
  }
  const data = query.data;
  const recent = data?.recent ?? [];

  async function retryJob(job) {
    try {
      await retry.mutateAsync(job);
      toast.success("Notification retry queued");
    } catch (error) {
      toast.error("Retry could not be queued", { description: error.message });
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="delivery-dashboard-heading">
      <div>
        <h2
          id="delivery-dashboard-heading"
          className="font-heading text-lg font-semibold"
        >
          External delivery status
        </h2>
        <p className="text-sm text-muted-foreground">
          Operational metadata only. Message bodies and complete destinations
          are never shown.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending"
          value={data?.counts?.pending ?? 0}
          icon={Clock3}
        />
        <StatCard label="Sent" value={data?.counts?.sent ?? 0} icon={Send} />
        <StatCard
          label="Failed"
          value={data?.counts?.failed ?? 0}
          icon={TriangleAlert}
        />
        <StatCard
          label="Unconfigured"
          value={data?.counts?.unconfigured ?? 0}
          icon={WifiOff}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {(data?.channels ?? []).map((channel) => (
          <Badge
            key={channel.channel}
            variant={channel.configured ? "success" : "secondary"}
          >
            {channel.channel.toUpperCase()}:{" "}
            {channel.configured ? "Configured" : "Disabled"}
          </Badge>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent delivery jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <EmptyState compact title="No external delivery jobs" />
          ) : (
            <div className="divide-y">
              {recent.map((job) => (
                <article
                  key={job.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {job.event_type.replaceAll("_", " ")}
                      </p>
                      <Badge variant="outline">{job.channel}</Badge>
                      <Badge
                        variant={
                          job.status === "sent" ? "success" : "secondary"
                        }
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {job.destination_hint ?? "Destination not resolved"} ·
                      Attempts {job.attempt_count}/{job.max_attempts} ·{" "}
                      {formatManilaDateTime(job.created_at)}
                    </p>
                    {job.failure_category ? (
                      <p className="mt-1 text-xs text-destructive">
                        Category: {job.failure_category.replaceAll("_", " ")}
                      </p>
                    ) : null}
                  </div>
                  {job.status === "failed" && job.manual_retry_count < 2 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retryJob(job)}
                    >
                      <RefreshCw /> Retry
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
