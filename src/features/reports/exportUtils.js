import { jsPDF } from "jspdf";

import { formatManilaDateTime } from "@/lib/dateTime";

const PAGE_MARGIN = 14;
const PAGE_BOTTOM_MARGIN = 16;
const TABLE_FONT_SIZE = 8;
const TABLE_LINE_HEIGHT = 3.6;
const TABLE_CELL_PADDING = 2;
const TABLE_HEADER_HEIGHT = 8;

function printableValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function columnLabel(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function documentFactory() {
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
}

function textLines(document, value, width) {
  const lines = document.splitTextToSize(
    printableValue(value),
    Math.max(width - TABLE_CELL_PADDING * 2, 1),
  );
  return Array.isArray(lines) ? lines : [String(lines)];
}

function drawDocumentHeader(document, metadata) {
  const generatedAt = metadata.generatedAt ?? new Date();
  let y = PAGE_MARGIN;

  document.setFont("helvetica", "bold");
  document.setFontSize(16);
  document.text("ALAGA-SYS", PAGE_MARGIN, y);
  y += 5;
  document.setFontSize(10);
  document.text("Barangay Healthcare", PAGE_MARGIN, y);
  y += 4;
  document.setFont("helvetica", "normal");
  document.text("Brgy. Bagongpook", PAGE_MARGIN, y);
  y += 8;

  document.setFont("helvetica", "bold");
  document.text(`Report: ${metadata.categoryLabel}`, PAGE_MARGIN, y);
  y += 5;
  document.setFont("helvetica", "normal");
  document.text(
    `Reporting period: ${metadata.startDate} to ${metadata.endDate}`,
    PAGE_MARGIN,
    y,
  );
  y += 5;
  document.text(
    `Generated: ${formatManilaDateTime(generatedAt)} · Asia/Manila`,
    PAGE_MARGIN,
    y,
  );
  return y + 8;
}

function drawContinuationHeader(document, metadata) {
  document.setFont("helvetica", "bold");
  document.setFontSize(9);
  document.text(
    `ALAGA-SYS · ${metadata.categoryLabel} · ${metadata.startDate} to ${metadata.endDate}`,
    PAGE_MARGIN,
    PAGE_MARGIN,
  );
  return PAGE_MARGIN + 6;
}

function drawTableHeader(document, columns, columnWidth, y) {
  document.setFillColor(229, 241, 239);
  document.rect(
    PAGE_MARGIN,
    y,
    columnWidth * columns.length,
    TABLE_HEADER_HEIGHT,
    "F",
  );
  document.setFont("helvetica", "bold");
  document.setFontSize(TABLE_FONT_SIZE);
  columns.forEach((column, index) => {
    document.text(
      textLines(document, columnLabel(column), columnWidth),
      PAGE_MARGIN + index * columnWidth + TABLE_CELL_PADDING,
      y + 3,
    );
  });
  return y + TABLE_HEADER_HEIGHT;
}

function drawTableRows(document, rows, columns, metadata, startY) {
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const tableWidth = pageWidth - PAGE_MARGIN * 2;
  const columnWidth = tableWidth / columns.length;
  const maximumLinesPerCell = Math.max(
    1,
    Math.floor(
      (pageHeight -
        PAGE_MARGIN -
        6 -
        TABLE_HEADER_HEIGHT -
        PAGE_BOTTOM_MARGIN -
        TABLE_CELL_PADDING * 2) /
        TABLE_LINE_HEIGHT,
    ),
  );
  let y = drawTableHeader(document, columns, columnWidth, startY);

  rows.forEach((row) => {
    const cells = columns.map((column) => {
      const lines = textLines(document, row[column], columnWidth);
      if (lines.length <= maximumLinesPerCell) return lines;
      const visible = lines.slice(0, maximumLinesPerCell);
      visible[visible.length - 1] = `${visible.at(-1)}…`;
      return visible;
    });
    const rowHeight = Math.max(
      7,
      Math.max(...cells.map((cell) => cell.length)) * TABLE_LINE_HEIGHT +
        TABLE_CELL_PADDING * 2,
    );

    if (y + rowHeight > pageHeight - PAGE_BOTTOM_MARGIN) {
      document.addPage();
      y = drawContinuationHeader(document, metadata);
      y = drawTableHeader(document, columns, columnWidth, y);
    }

    document.setFont("helvetica", "normal");
    document.setFontSize(TABLE_FONT_SIZE);
    cells.forEach((cell, index) => {
      document.text(
        cell,
        PAGE_MARGIN + index * columnWidth + TABLE_CELL_PADDING,
        y + 3,
      );
    });
    document.setDrawColor(210, 214, 220);
    document.line(
      PAGE_MARGIN,
      y + rowHeight,
      pageWidth - PAGE_MARGIN,
      y + rowHeight,
    );
    y += rowHeight;
  });
}

export function reportFilename(category, startDate, endDate, extension) {
  const safeCategory = category.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return `alaga-sys-${safeCategory}-${startDate}-to-${endDate}.${extension}`;
}

export function downloadPdfReport(rows, metadata, dependencies = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No report data is available for PDF export.");
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!columns.length) {
    throw new Error("No report data is available for PDF export.");
  }

  const document = (dependencies.createDocument ?? documentFactory)();
  const normalizedMetadata = {
    ...metadata,
    categoryLabel: metadata.categoryLabel || columnLabel(metadata.category),
    generatedAt: dependencies.generatedAt ?? metadata.generatedAt,
  };
  document.setProperties({
    title: `ALAGA-SYS ${normalizedMetadata.categoryLabel}`,
    subject: `${normalizedMetadata.startDate} to ${normalizedMetadata.endDate}`,
    creator: "ALAGA-SYS",
  });
  const startY = drawDocumentHeader(document, normalizedMetadata);
  drawTableRows(document, rows, columns, normalizedMetadata, startY);

  const filename = reportFilename(
    normalizedMetadata.category,
    normalizedMetadata.startDate,
    normalizedMetadata.endDate,
    "pdf",
  );
  document.save(filename);
  return filename;
}
