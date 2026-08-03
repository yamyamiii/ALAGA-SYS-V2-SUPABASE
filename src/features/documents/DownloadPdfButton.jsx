import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadDocumentPdf } from "@/features/documents/pdf";

export function DownloadPdfButton({ model, disabled = false, onError }) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!model || downloading) return;
    setDownloading(true);
    try {
      await downloadDocumentPdf(model);
    } catch (error) {
      onError?.(error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button type="button" disabled={disabled || downloading} onClick={download}>
      <Download /> {downloading ? "Preparing PDF…" : "Download PDF"}
    </Button>
  );
}
