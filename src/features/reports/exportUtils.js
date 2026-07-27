const DANGEROUS_FORMULA = /^[=+\-@]/;

export function safeSpreadsheetCell(value) {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return DANGEROUS_FORMULA.test(text.trimStart()) ? `'${text}` : text;
}

function csvCell(value) {
  const safe = safeSpreadsheetCell(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")),
  ].join("\r\n");
}

export function reportFilename(category, startDate, endDate, extension) {
  const safeCategory = category.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return `alaga-sys-${safeCategory}-${startDate}-to-${endDate}.${extension}`;
}

export function downloadReport(rows, metadata, format) {
  const excel = format === "excel";
  const content = `${excel ? "\uFEFF" : ""}${rowsToCsv(rows)}`;
  const blob = new Blob([content], {
    type: excel ? "text/csv;charset=utf-8" : "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = reportFilename(
    metadata.category,
    metadata.startDate,
    metadata.endDate,
    excel ? "csv" : "csv",
  );
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
