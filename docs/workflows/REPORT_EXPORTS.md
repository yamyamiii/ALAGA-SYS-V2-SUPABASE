# Report export and printing workflow

Authorized staff select a report category, inclusive date range, and supported
filters. The export request repeats database authorization and obtains no more
than 5,000 aggregate rows.

## Formats

- CSV uses UTF-8, quoted fields, stable headers, and a sanitized filename.
- Excel produces a UTF-8 BOM CSV suitable for opening in spreadsheet software.
- PDF opens the browser print workflow; choose **Save as PDF**.
- Print uses an A4-friendly, monochrome layout with repeated table headers.

CSV and Excel cells beginning with `=`, `+`, `-`, or `@` are prefixed with an
apostrophe to prevent spreadsheet formula execution. Download data is held only
in a temporary browser Blob and is immediately released. It is not written to
localStorage or another browser cache by application code.

Each successful export records only the actor, report type, date range, names of
filters used, format, and aggregate row count. It does not audit filter values,
resident identifiers, names, or clinical content. Large requests are tagged
separately; requests beyond the hard limit are rejected.

## Manual verification

1. Sign in as each supported staff role and confirm only authorized categories.
2. Export a zero-result report and a populated report.
3. Open CSV in a text editor and spreadsheet application.
4. Confirm formula-like test values are inert.
5. Print at 1366 px, 768 px, and 390 px viewport widths.
6. Verify headers, reporting period, Bagongpook context, Manila generation time,
   page breaks, and absence of navigation controls.
