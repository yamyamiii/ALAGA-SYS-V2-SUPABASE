import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildDocumentModel } from "@/features/documents/documentModels";
import { documentKeys, useProtectedDocument } from "@/features/documents/hooks";
import { DownloadPdfButton } from "@/features/documents/DownloadPdfButton";
import { PrintButton } from "@/features/documents/PrintButton";
import { PrintableDocumentLayout } from "@/features/documents/PrintableDocumentLayout";

export function DocumentPreviewDialog({
  documentType,
  recordId,
  open,
  onOpenChange,
}) {
  const queryClient = useQueryClient();
  const query = useProtectedDocument(documentType, recordId, open);
  const [downloadError, setDownloadError] = useState("");
  const model = useMemo(() => {
    if (!query.data) return null;
    return buildDocumentModel(
      documentType,
      query.data,
      new Date(query.dataUpdatedAt || Date.now()),
    );
  }, [documentType, query.data, query.dataUpdatedAt]);

  useEffect(() => {
    if (open) return;
    setDownloadError("");
    queryClient.removeQueries({
      queryKey: documentKeys.detail(documentType, recordId),
      exact: true,
    });
  }, [documentType, open, queryClient, recordId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] max-w-6xl overflow-hidden p-0 sm:max-h-[calc(100dvh-2rem)]">
        <div className="border-b px-4 py-4 sm:px-6">
          <DialogHeader>
            <DialogTitle>Document preview</DialogTitle>
            <DialogDescription>
              Review the authorized, minimized document before printing or
              downloading it.
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="min-h-0 overflow-y-auto bg-slate-100 p-2 sm:p-5">
          {query.isLoading ? (
            <LoadingState
              title="Preparing protected document"
              description="Revalidating record access and loading approved fields…"
            />
          ) : query.isError ? (
            <ErrorState
              title={
                query.error.code === "permission_denied"
                  ? "Document access denied"
                  : query.error.code === "offline"
                    ? "Document unavailable offline"
                    : "Document unavailable"
              }
              description={query.error.message}
              actionLabel="Try again"
              onAction={() => query.refetch()}
            />
          ) : model ? (
            <PrintableDocumentLayout model={model} />
          ) : null}
        </div>
        <DialogFooter className="print-controls border-t px-4 py-3 sm:px-6">
          {downloadError ? (
            <p role="alert" className="mr-auto text-sm text-destructive">
              {downloadError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <PrintButton disabled={!model || query.isFetching} />
          <DownloadPdfButton
            model={model}
            disabled={!model || query.isFetching}
            onError={() =>
              setDownloadError(
                "The PDF could not be generated. Use browser printing instead.",
              )
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
