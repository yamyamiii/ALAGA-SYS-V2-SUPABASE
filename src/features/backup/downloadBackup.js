const ALLOWED_DOWNLOAD_PROTOCOLS = new Set(["http:", "https:"]);

export function downloadBackupFile(downloadUrl, filename) {
  const url = new URL(downloadUrl, window.location.origin);
  if (!ALLOWED_DOWNLOAD_PROTOCOLS.has(url.protocol)) {
    throw new Error("Unsupported backup download URL");
  }

  const link = document.createElement("a");
  link.href = url.href;
  link.download = filename || "ALAGA_BACKUP.zip";
  link.rel = "noopener noreferrer";
  link.className = "sr-only";
  document.body.append(link);
  link.click();
  link.remove();
}
