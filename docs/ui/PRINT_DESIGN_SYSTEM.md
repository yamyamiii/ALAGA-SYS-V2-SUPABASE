# Print design system

Protected documents use one calm blue healthcare layout on a white A4 portrait
surface. The header contains the official object-contain logo, ALAGA-SYS,
“Automated Local Appointment and General Assistance System,” Barangay
Bagongpook Health Center, document title, and safe reference number.

## Shared components

- `DocumentPreviewDialog`: keyboard-trapped, scrollable responsive preview
- `PrintableDocumentLayout`: semantic A4 content boundary
- `DocumentHeader` and `DocumentFooter`: branding, privacy, and generation time
- `SignatureBlock`: page-break-safe printed-name/signature area
- `PrintButton`: scoped browser print
- `DownloadPdfButton`: local selectable-text PDF download

Preview width is capped at 210 mm and adapts to tablet/mobile without clipping.
Mobile field grids collapse to one column; tables scroll only in preview and
fit the print/PDF width. Print CSS repeats table headers and avoids splitting
critical rows, sections, and signature blocks. A light text watermark is
decorative and ignored by assistive technology.

The footer uses a semantic `time` element with an explicit Asia/Manila value.
It is informational only; database timestamps remain authoritative. PDF
footers include deterministic page numbers. Empty or masked fields use clear
“Not available” language rather than fabricated values.
