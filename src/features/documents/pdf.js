const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 18;

async function logoDataUrl() {
  try {
    const response = await fetch("/alaga-logo.png", { cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function printable(value) {
  return String(value ?? "Not available");
}

export async function downloadDocumentPdf(model) {
  const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), logoDataUrl()]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = MARGIN;

  const addWatermark = () => {
    pdf.setTextColor(235, 241, 248);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(30);
    pdf.text("ALAGA-SYS", PAGE_WIDTH / 2, PAGE_HEIGHT / 2, {
      align: "center",
      angle: 35,
    });
    pdf.setTextColor(20, 48, 75);
  };

  const addHeader = () => {
    addWatermark();
    if (logo) {
      try {
        pdf.addImage(logo, "PNG", MARGIN, y, 18, 18, undefined, "FAST");
      } catch {
        // The textual brand remains as the safe fallback.
      }
    }
    pdf.setTextColor(17, 75, 122);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("ALAGA-SYS", MARGIN + 22, y + 5);
    pdf.setFontSize(8.5);
    pdf.text(
      "Automated Local Appointment and General Assistance System",
      MARGIN + 22,
      y + 10,
    );
    pdf.setFont("helvetica", "normal");
    pdf.text("Barangay Bagongpook Health Center", MARGIN + 22, y + 14.5);
    y += 22;
    pdf.setDrawColor(46, 116, 181);
    pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 7;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text(model.title, MARGIN, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(70, 78, 88);
    pdf.text(`Reference: ${printable(model.identifier)}`, MARGIN, y);
    y += 8;
  };

  const newPage = () => {
    pdf.addPage();
    y = MARGIN;
    addHeader();
  };

  const ensureSpace = (height) => {
    if (y + height > PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT) newPage();
  };

  const writeWrapped = (value, x, width, options = {}) => {
    const lines = pdf.splitTextToSize(printable(value), width);
    pdf.text(lines, x, y, options);
    y += lines.length * 4.5;
  };

  const drawFields = (fields = []) => {
    for (let index = 0; index < fields.length; index += 2) {
      const pair = fields.slice(index, index + 2);
      const widths =
        pair.length === 1
          ? [CONTENT_WIDTH]
          : [CONTENT_WIDTH / 2, CONTENT_WIDTH / 2];
      const heights = pair.map((field, fieldIndex) => {
        const lines = pdf.splitTextToSize(
          printable(field.value),
          widths[fieldIndex] - 4,
        );
        return 7 + lines.length * 4;
      });
      const rowHeight = Math.max(...heights, 13);
      ensureSpace(rowHeight + 2);
      pair.forEach((field, fieldIndex) => {
        const x =
          MARGIN +
          widths.slice(0, fieldIndex).reduce((sum, width) => sum + width, 0);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(78, 92, 107);
        pdf.text(field.label.toUpperCase(), x, y);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(20, 35, 50);
        const lines = pdf.splitTextToSize(
          printable(field.value),
          widths[fieldIndex] - 4,
        );
        pdf.text(lines, x, y + 5);
      });
      y += rowHeight;
    }
  };

  const drawTable = (table) => {
    const columns = table.columns;
    const columnWidth = CONTENT_WIDTH / columns.length;
    const drawTableHeader = () => {
      ensureSpace(9);
      pdf.setFillColor(231, 241, 250);
      pdf.rect(MARGIN, y - 4, CONTENT_WIDTH, 8, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(20, 61, 95);
      columns.forEach((column, index) => {
        pdf.text(column.label, MARGIN + index * columnWidth + 1.5, y);
      });
      y += 6;
    };
    if (!table.rows.length) {
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9);
      writeWrapped(table.empty, MARGIN, CONTENT_WIDTH);
      return;
    }
    drawTableHeader();
    for (const row of table.rows) {
      const cells = columns.map((column) =>
        pdf.splitTextToSize(printable(row[column.key]), columnWidth - 3),
      );
      const rowHeight = Math.max(...cells.map((cell) => cell.length)) * 4 + 4;
      if (y + rowHeight > PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT) {
        newPage();
        drawTableHeader();
      }
      pdf.setDrawColor(205, 215, 225);
      pdf.line(MARGIN, y - 2, PAGE_WIDTH - MARGIN, y - 2);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(25, 38, 52);
      cells.forEach((cell, index) => {
        pdf.text(cell, MARGIN + index * columnWidth + 1.5, y + 2);
      });
      y += rowHeight;
    }
  };

  addHeader();
  drawFields(model.fields);

  for (const section of model.sections) {
    ensureSpace(16);
    y += 2;
    pdf.setDrawColor(164, 190, 214);
    pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 6;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(17, 75, 122);
    pdf.text(section.title, MARGIN, y);
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(25, 38, 52);
    if (section.note) writeWrapped(section.note, MARGIN, CONTENT_WIDTH);
    if (section.fields) drawFields(section.fields);
    if (section.table) drawTable(section.table);
  }

  if (model.signature) {
    ensureSpace(35);
    y += 12;
    pdf.setDrawColor(40, 55, 70);
    pdf.line(MARGIN, y, MARGIN + 70, y);
    y += 5;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(printable(model.signature.name), MARGIN, y);
    y += 4;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(model.signature.label, MARGIN, y);
    y += 4;
    pdf.text(model.signature.detail, MARGIN, y);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(180, 195, 208);
    pdf.line(MARGIN, PAGE_HEIGHT - 17, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 17);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(80, 90, 100);
    const notice = pdf.splitTextToSize(model.privacyNotice, CONTENT_WIDTH - 35);
    pdf.text(notice, MARGIN, PAGE_HEIGHT - 12);
    pdf.text(`Page ${page} of ${pages}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 4, {
      align: "right",
    });
    pdf.text(`Generated ${model.generatedLabel}`, MARGIN, PAGE_HEIGHT - 4);
  }

  pdf.save(model.filename);
}
