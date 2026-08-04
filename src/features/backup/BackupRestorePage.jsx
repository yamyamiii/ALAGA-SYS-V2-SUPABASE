import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  DatabaseBackup,
  Download,
  FileCheck2,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadBackupFile } from "@/features/backup/downloadBackup";
import { backupService } from "@/services/backupService";

const key = ["backup-administration"];
const formatBytes = (value) =>
  value
    ? new Intl.NumberFormat("en", {
        style: "unit",
        unit: "byte",
        notation: "compact",
        unitDisplay: "narrow",
      }).format(value)
    : "—";
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const badge = (status) =>
  status === "completed" || status === "verified"
    ? "success"
    : status === "failed"
      ? "destructive"
      : status === "processing" || status === "approved"
        ? "warning"
        : "outline";

function HistoryCard({ rows, onDownload, onRetry, downloading }) {
  return (
    <Card className="min-w-0 xl:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" aria-hidden="true" />
          Backup history
        </CardTitle>
        <CardDescription>
          Private application packages and integrity status. Deleted retention
          entries remain as minimized history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No backups have been requested.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <article
                key={row.id}
                className="grid min-w-0 gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm font-semibold">
                    {row.backup_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(row.created_at)} · {row.mode} · v
                    {row.backup_version} · {formatBytes(row.size_bytes)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={badge(row.status)}>{row.status}</Badge>
                    <Badge variant={badge(row.checksum_status)}>
                      checksum {row.checksum_status}
                    </Badge>
                  </div>
                  {row.failure_category ? (
                    <p className="mt-2 text-xs text-destructive">
                      Failure category: {row.failure_category}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
                  {row.status === "completed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10 w-full touch-manipulation sm:w-auto"
                      disabled={downloading}
                      onClick={() => onDownload(row)}
                    >
                      <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                      Download
                    </Button>
                  ) : null}
                  {row.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10 w-full touch-manipulation sm:w-auto"
                      onClick={() => onRetry(row)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      Retry
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RestoreDialog({ preview, onClose, onRestore, restoring }) {
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    if (preview) setConfirmation("");
  }, [preview]);
  if (!preview) return null;
  const restore = preview.restore;
  const hasBlockingPrerequisites =
    Number(restore.preview_counts?.conflicts ?? 0) > 0 ||
    Number(restore.preview_counts?.missing_auth_users ?? 0) > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !restoring) onClose();
      }}
    >
      <DialogContent className="max-w-2xl" data-testid="restore-preview-dialog">
        <DialogHeader className="pr-10">
          <DialogTitle>Confirm application restore</DialogTitle>
          <DialogDescription>
            Integrity checks passed. Review the dry-run preview. The transaction
            will stop and roll back on any conflict.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
          <p className="min-w-0 break-words">
            <span className="text-muted-foreground">Backup:</span>
            <br />
            {restore.backup_name}
          </p>
          <p className="min-w-0 break-words">
            <span className="text-muted-foreground">Versions:</span>
            <br />
            backup {restore.backup_version} · app {restore.application_version}{" "}
            · schema {restore.schema_version}
          </p>
          <p className="min-w-0 break-words">
            <span className="text-muted-foreground">Backup date:</span>
            <br />
            {formatDate(restore.backup_created_at)}
          </p>
          {Object.entries(restore.preview_counts ?? {}).map(([name, count]) => (
            <p key={name}>
              <span className="capitalize text-muted-foreground">
                {name.replaceAll("_", " ")}:
              </span>{" "}
              {count}
            </p>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Verified files</p>
          <ul className="grid max-h-32 gap-1 overflow-y-auto rounded-lg border p-3 text-xs text-muted-foreground sm:grid-cols-2">
            {restore.files?.map((file) => (
              <li key={file} className="break-all">
                {file}
              </li>
            ))}
          </ul>
        </div>
        <Alert>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {restore.warnings?.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
        {hasBlockingPrerequisites ? (
          <Alert variant="destructive">
            <AlertDescription>
              Restore is blocked until all row conflicts are resolved and the
              required Supabase Auth users exist.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="restore-confirmation">Type RESTORE to confirm</Label>
          <Input
            id="restore-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter className="dialog-safe-footer sticky bottom-0 z-10 -mx-4 -mb-4 border-t bg-background px-4 pt-3 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button
            className="min-h-11 w-full touch-manipulation sm:w-auto"
            variant="outline"
            disabled={restoring}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="min-h-11 w-full touch-manipulation sm:w-auto"
            variant="destructive"
            disabled={
              hasBlockingPrerequisites ||
              confirmation !== "RESTORE" ||
              restoring
            }
            onClick={() => onRestore(preview)}
          >
            {restoring ? (
              <LoaderCircle
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Restore backup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BackupRestorePage() {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const query = useQuery({
    queryKey: key,
    queryFn: () => backupService.getDashboard(),
    refetchInterval: (state) =>
      state.state.data?.backups?.some((row) =>
        ["queued", "processing"].includes(row.status),
      )
        ? 3000
        : false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.data?.configuration && !schedule)
      setSchedule(query.data.configuration);
  }, [query.data, schedule]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: () => backupService.createBackup(),
    onSuccess: async () => {
      toast.success("Backup queued");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const retry = useMutation({
    mutationFn: (row) => backupService.retryBackup(row.id),
    onSuccess: async () => {
      toast.success("Backup retry queued");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const download = useMutation({
    mutationFn: (row) => backupService.downloadBackup(row.id),
    onSuccess: (result, row) => {
      try {
        downloadBackupFile(result.download_url, row.backup_name);
      } catch {
        toast.error("The secure backup download could not be started.");
      }
    },
    onError: (error) => toast.error(error.message),
  });
  const validate = useMutation({
    mutationFn: (file) => backupService.validateRestore(file),
    onSuccess: (result) => setPreview(result),
    onError: (error) => toast.error(error.message),
  });
  const restore = useMutation({
    mutationFn: (value) =>
      backupService.restore(value.restore.id, value.confirmation_token),
    onSuccess: async () => {
      setPreview(null);
      toast.success("Restore completed with verified integrity");
      await invalidate();
    },
    onError: (error) => {
      setPreview(null);
      toast.error(error.message);
      invalidate();
    },
  });
  const updateSchedule = useMutation({
    mutationFn: () => backupService.updateSchedule(schedule),
    onSuccess: async (updated) => {
      toast.success("Automatic backup settings saved");
      setSchedule(updated);
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isLoading)
    return (
      <LoadingState
        title="Loading backup administration"
        description="Retrieving protected recovery history…"
      />
    );
  if (query.isError)
    return (
      <ErrorState
        title="Backup administration unavailable"
        description={query.error.message}
        actionLabel="Try again"
        onAction={() => query.refetch()}
      />
    );
  const data = query.data ?? { backups: [], restores: [], configuration: {} };
  const latestReport =
    [...(data.restores ?? [])].find((row) => row.status === "completed") ??
    [...data.backups].find((row) => row.status === "completed");
  return (
    <div className="min-w-0 space-y-6" data-testid="backup-restore-page">
      <PageHeading
        eyebrow="Administration"
        title="Backup & Restore"
        description="Create integrity-verified, application-aware recovery packages without exporting credentials, sessions, AI conversations, or runtime data."
      />
      <Alert>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          Backups contain sensitive health data. Download only to approved
          encrypted storage and follow the documented recovery procedure.
        </AlertDescription>
      </Alert>
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DatabaseBackup className="h-5 w-5" aria-hidden="true" />
              Create backup
            </CardTitle>
            <CardDescription>
              Queues a non-blocking snapshot. The protected worker generates and
              signs the ZIP package.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="min-h-11 w-full touch-manipulation sm:w-auto"
              onClick={() => create.mutate()}
              disabled={
                create.isPending ||
                data.backups.some((row) =>
                  ["queued", "processing"].includes(row.status),
                )
              }
            >
              {create.isPending ? (
                <LoaderCircle
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <DatabaseBackup className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Create Backup
            </Button>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" aria-hidden="true" />
              Restore backup
            </CardTitle>
            <CardDescription>
              Upload, verify, preview, and explicitly confirm a compatible
              ALAGA-SYS package.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="backup-restore-file" className="sr-only">
              Select an ALAGA-SYS backup ZIP file
            </Label>
            <input
              id="backup-restore-file"
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".zip,application/zip"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) validate.mutate(file);
                event.target.value = "";
              }}
            />
            <Button
              className="min-h-11 w-full touch-manipulation sm:w-auto"
              variant="outline"
              disabled={validate.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {validate.isPending ? (
                <LoaderCircle
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FileCheck2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Validate backup
            </Button>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
              Automatic backup
            </CardTitle>
            <CardDescription>
              Scheduler-ready settings. A scheduler must be deployed separately.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="backup-frequency">Frequency</Label>
              <select
                id="backup-frequency"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={schedule?.frequency ?? "disabled"}
                onChange={(event) =>
                  setSchedule((current) => ({
                    ...current,
                    frequency: event.target.value,
                  }))
                }
              >
                <option value="disabled">Disabled</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-retention">Retention (1–30)</Label>
              <Input
                id="backup-retention"
                type="number"
                min="1"
                max="30"
                value={schedule?.retention_count ?? 7}
                onChange={(event) =>
                  setSchedule((current) => ({
                    ...current,
                    retention_count: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              className="min-h-11 w-full touch-manipulation sm:col-span-2 sm:w-fit"
              variant="outline"
              disabled={updateSchedule.isPending}
              onClick={() => updateSchedule.mutate()}
            >
              Save schedule
            </Button>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
              Recovery report
            </CardTitle>
            <CardDescription>
              Latest minimized integrity and recovery outcome.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {latestReport ? (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Package:</span>{" "}
                  <span className="break-all">{latestReport.backup_name}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Completed:</span>{" "}
                  {formatDate(latestReport.completed_at)}
                </p>
                <pre className="max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                  {JSON.stringify(latestReport.report, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No completed recovery or integrity report yet.
              </p>
            )}
          </CardContent>
        </Card>
        <HistoryCard
          rows={data.backups ?? []}
          onDownload={(row) => download.mutate(row)}
          onRetry={(row) => retry.mutate(row)}
          downloading={download.isPending}
        />
      </div>
      <RestoreDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onRestore={(value) => restore.mutate(value)}
        restoring={restore.isPending}
      />
    </div>
  );
}
