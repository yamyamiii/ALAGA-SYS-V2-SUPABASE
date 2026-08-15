import { Archive, Megaphone, Pencil, Pin, Plus } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnnouncementDialog } from "@/features/assistance/AssistanceDialogs";
import {
  ANNOUNCEMENT_CATEGORIES,
  optionLabel,
} from "@/features/assistance/constants";
import {
  useAnnouncements,
  useAssistanceMutation,
} from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { PERMISSIONS } from "@/features/auth/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { formatManilaDateTime } from "@/lib/dateTime";
import { assistanceService } from "@/services/assistanceService";

export default function AnnouncementsPage() {
  const { can } = useAuth();
  const canManage = can(PERMISSIONS.MANAGE_ANNOUNCEMENTS);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    include_archived: false,
    page: 1,
    page_size: 20,
  });
  const search = useDeferredValue(filters.search);
  const query = useAnnouncements({ ...filters, search });
  const save = useAssistanceMutation(assistanceService.saveAnnouncement);
  const archive = useAssistanceMutation(({ id, version }) =>
    assistanceService.archiveAnnouncement(id, version),
  );
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(null);
  const open = (record = null) => {
    setEditing(record);
    setDialogOpen(true);
  };
  const archiveAnnouncement = async () => {
    if (!archiving) return;
    try {
      await archive.mutateAsync({
        id: archiving.id,
        version: archiving.version,
      });
      setArchiving(null);
      toast.success("Announcement archived");
    } catch (error) {
      toast.error("Announcement could not be archived", {
        description: error.message,
      });
    }
  };
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Community information"
        title="Announcements"
        description="Current barangay health center advisories. Expired announcements are removed automatically."
        actions={
          canManage ? (
            <Button onClick={() => open()}>
              <Plus />
              Create announcement
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              aria-label="Search announcements"
              placeholder="Search announcements"
              value={filters.search}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  search: event.target.value,
                  page: 1,
                }))
              }
            />
            <select
              aria-label="Announcement category"
              className="h-10 rounded-lg border bg-background px-3 text-sm"
              value={filters.category}
              onChange={(event) =>
                setFilters((value) => ({
                  ...value,
                  category: event.target.value,
                  page: 1,
                }))
              }
            >
              <option value="">All categories</option>
              {ANNOUNCEMENT_CATEGORIES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {canManage ? (
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.include_archived}
                  onChange={(event) =>
                    setFilters((value) => ({
                      ...value,
                      include_archived: event.target.checked,
                      page: 1,
                    }))
                  }
                />
                Show archived
              </label>
            ) : null}
          </div>
        </CardContent>
        {query.isLoading ? (
          <LoadingState title="Loading announcements" />
        ) : query.isError ? (
          <ErrorState
            title="Announcements unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            title="No announcements"
            description="No current announcements match these filters."
          />
        ) : (
          <div className="grid gap-4 p-5 pt-0 lg:grid-cols-2">
            {query.data.items.map((item) => (
              <article key={item.id} className="rounded-xl border p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {item.is_pinned ? (
                    <Badge>
                      <Pin className="mr-1 h-3 w-3" />
                      Pinned
                    </Badge>
                  ) : null}
                  <Badge variant="secondary">
                    {optionLabel(ANNOUNCEMENT_CATEGORIES, item.category)}
                  </Badge>
                  {item.archived_at ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : null}
                </div>
                <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {item.content}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Published {formatManilaDateTime(item.publish_at)}
                  {item.creator_name ? ` by ${item.creator_name}` : ""}
                  {item.expires_at
                    ? ` · Expires ${formatManilaDateTime(item.expires_at)}`
                    : ""}
                </p>
                {canManage && !item.archived_at ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open(item)}
                    >
                      <Pencil />
                      Edit or pin
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setArchiving(item)}
                      disabled={archive.isPending}
                    >
                      <Archive />
                      Archive
                    </Button>
                  </div>
                ) : null}
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
      <AnnouncementDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        record={editing}
        mutation={save}
      />
      <Dialog
        open={Boolean(archiving)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !archive.isPending) setArchiving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive announcement?</DialogTitle>
            <DialogDescription>
              This announcement will no longer be visible to users, but it will
              remain available in archived records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={archive.isPending}
              onClick={() => setArchiving(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={archive.isPending}
              onClick={archiveAnnouncement}
            >
              <Archive />
              {archive.isPending ? "Archiving…" : "Archive announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Megaphone className="h-4 w-4" />
        Announcements must never contain private health information.
      </div>
    </div>
  );
}
