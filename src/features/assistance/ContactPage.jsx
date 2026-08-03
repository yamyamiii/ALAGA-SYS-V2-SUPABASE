import { MessageSquarePlus, Pencil } from "lucide-react";
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
import {
  InquiryCreateDialog,
  InquiryUpdateDialog,
} from "@/features/assistance/AssistanceDialogs";
import {
  INQUIRY_CATEGORIES,
  INQUIRY_STATUSES,
  optionLabel,
} from "@/features/assistance/constants";
import {
  useAssistanceMutation,
  useInquiries,
} from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { formatManilaDateTime } from "@/lib/dateTime";
import { assistanceService } from "@/services/assistanceService";

export default function ContactPage() {
  const { can } = useAuth();
  const canSubmit = can(PERMISSIONS.SUBMIT_INQUIRY);
  const canManage = can(PERMISSIONS.MANAGE_INQUIRIES);
  const [filters, setFilters] = useState({
    status: "",
    page: 1,
    page_size: 20,
  });
  const query = useInquiries(filters);
  const create = useAssistanceMutation(assistanceService.createInquiry);
  const update = useAssistanceMutation(assistanceService.updateInquiry);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Contact the health center"
        title={canManage ? "Resident inquiries" : "My inquiries"}
        description="A simple ticket workflow for non-urgent questions. This is not live chat or an emergency service."
        actions={
          canSubmit ? (
            <Button onClick={() => setCreateOpen(true)}>
              <MessageSquarePlus />
              Submit inquiry
            </Button>
          ) : null
        }
      />
      <div className="max-w-xs">
        <select
          aria-label="Inquiry status"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          value={filters.status}
          onChange={(e) =>
            setFilters((v) => ({ ...v, status: e.target.value, page: 1 }))
          }
        >
          <option value="">All statuses</option>
          {INQUIRY_STATUSES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Card>
        {query.isLoading ? (
          <LoadingState title="Loading inquiries" />
        ) : query.isError ? (
          <ErrorState
            title="Inquiries unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No inquiries"
            description={
              canSubmit
                ? "Submit a ticket when you need non-urgent assistance."
                : "No inquiries match this view."
            }
          />
        ) : (
          <div className="divide-y">
            {query.data.items.map((item) => (
              <article key={item.id} className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">
                    {item.inquiry_number} · {item.subject}
                  </h2>
                  <Badge>{optionLabel(INQUIRY_STATUSES, item.status)}</Badge>
                  <Badge variant="secondary">
                    {optionLabel(INQUIRY_CATEGORIES, item.category)}
                  </Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                  {item.message}
                </p>
                {item.staff_response ? (
                  <div className="mt-4 rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      Health center response
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {item.staff_response}
                    </p>
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-muted-foreground">
                  Updated {formatManilaDateTime(item.updated_at)}
                </p>
                {canManage && item.status !== "closed" ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(item)}
                  >
                    <Pencil />
                    Update status
                  </Button>
                ) : null}
              </article>
            ))}
          </div>
        )}
        <RegistryPagination
          page={filters.page}
          pageSize={filters.page_size}
          total={query.data?.total ?? 0}
          onChange={(change) => setFilters((v) => ({ ...v, ...change }))}
        />
      </Card>
      <InquiryCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mutation={create}
      />
      <InquiryUpdateDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        record={editing}
        mutation={update}
      />
    </div>
  );
}
