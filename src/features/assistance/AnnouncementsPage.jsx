import { Archive, Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
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
  ANNOUNCEMENT_STATUSES,
  announcementCreationMessage,
  formatAnnouncementEventSchedule,
  getAnnouncementStatus,
} from "@/features/assistance/announcementStatus";
import {
  ANNOUNCEMENT_CATEGORIES,
  optionLabel,
} from "@/features/assistance/constants";
import {
  useAnnouncements,
  useAssistanceMutation,
} from "@/features/assistance/hooks";
import { useAuth } from "@/features/auth/authContext";
import { PERMISSIONS, USER_ROLES } from "@/features/auth/permissions";
import { RegistryPagination } from "@/features/registry/RegistryPagination";
import { formatManilaDateTime } from "@/lib/dateTime";
import { assistanceService } from "@/services/assistanceService";

export default function AnnouncementsPage() {
  const { can, profile } = useAuth();
  const canManage = can(PERMISSIONS.MANAGE_ANNOUNCEMENTS);
  const canDeletePermanently = profile?.role === USER_ROLES.ADMINISTRATOR;
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
  const permanentDelete = useAssistanceMutation(({ id, version }) =>
    assistanceService.deleteAnnouncement(id, version),
  );
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiving, setArchiving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
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
  const requestPermanentDelete = (record) => {
    setDeleteConfirmation("");
    setDeleting(record);
  };
  const deleteAnnouncement = async () => {
    if (!deleting || deleteConfirmation !== "DELETE") return;
    try {
      await permanentDelete.mutateAsync({
        id: deleting.id,
        version: deleting.version,
      });
      setDeleting(null);
      setDeleteConfirmation("");
      toast.success("Announcement permanently deleted");
    } catch (error) {
      toast.error("Announcement could not be deleted", {
        description: error.message,
      });
    }
  };
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Community information"
        title="Announcements"
        description={
          canManage
            ? "Manage published, scheduled, expired, and archived barangay health center advisories."
            : "Current barangay health center advisories."
        }
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
            description={
              canManage
                ? "No managed announcements match these filters."
                : "No current announcements match these filters."
            }
          />
        ) : (
          <div className="grid gap-4 p-5 pt-0 lg:grid-cols-2">
            {query.data.items.map((item) => {
              const status = getAnnouncementStatus(item);
              const eventSchedule = formatAnnouncementEventSchedule(
                item.event_start_at,
                item.event_end_at,
              );
              return (
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
                    <Badge
                      variant={
                        status === ANNOUNCEMENT_STATUSES.PUBLISHED
                          ? "default"
                          : "outline"
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {item.content}
                  </p>
                  <dl className="mt-4 space-y-1 text-xs text-muted-foreground">
                    {eventSchedule ? (
                      <div className="flex flex-wrap gap-1">
                        <dt className="font-medium text-foreground">Event:</dt>
                        <dd>{eventSchedule}</dd>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1">
                      <dt className="font-medium text-foreground">
                        {status === ANNOUNCEMENT_STATUSES.SCHEDULED
                          ? "Publishes:"
                          : "Published:"}
                      </dt>
                      <dd>{formatManilaDateTime(item.publish_at)}</dd>
                    </div>
                    {item.expires_at ? (
                      <div className="flex flex-wrap gap-1">
                        <dt className="font-medium text-foreground">
                          Expires:
                        </dt>
                        <dd>{formatManilaDateTime(item.expires_at)}</dd>
                      </div>
                    ) : null}
                    {item.creator_name ? (
                      <div className="flex flex-wrap gap-1">
                        <dt className="font-medium text-foreground">
                          Created by:
                        </dt>
                        <dd>{item.creator_name}</dd>
                      </div>
                    ) : null}
                  </dl>
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
                  {canDeletePermanently && item.archived_at ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => requestPermanentDelete(item)}
                        disabled={permanentDelete.isPending}
                      >
                        <Trash2 />
                        Delete permanently
                      </Button>
                    </div>
                  ) : null}
                </article>
              );
            })}
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
        onSaved={({ isNew, publishAt, publishNow }) => {
          if (isNew) {
            toast.success(
              announcementCreationMessage(publishAt, { publishNow }),
            );
          }
        }}
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
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !permanentDelete.isPending) {
            setDeleting(null);
            setDeleteConfirmation("");
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Permanently delete announcement?</DialogTitle>
            <DialogDescription>
              This permanently removes the archived announcement and cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="announcement-delete-confirmation">
              Type DELETE to confirm
            </Label>
            <Input
              id="announcement-delete-confirmation"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              disabled={permanentDelete.isPending}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={permanentDelete.isPending}
              onClick={() => {
                setDeleting(null);
                setDeleteConfirmation("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                permanentDelete.isPending || deleteConfirmation !== "DELETE"
              }
              onClick={deleteAnnouncement}
            >
              <Trash2 />
              {permanentDelete.isPending ? "Deleting…" : "Delete permanently"}
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
