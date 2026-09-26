# Report export and printing workflow

Authorized staff select a report category, inclusive date range, and supported
filters. The export request repeats database authorization and obtains no more
than 5,000 aggregate rows.

## Formats

- PDF directly downloads a generated `.pdf` containing only the authorized
  export rows for the currently applied filters.
- Print uses an A4-friendly, monochrome layout with repeated table headers.

PDF content is generated in memory and is not written to localStorage or
another browser cache by application code.

Each successful export records only the actor, report type, date range, names of
filters used, format, and aggregate row count. It does not audit filter values,
resident identifiers, names, or clinical content. Large requests are tagged
separately; requests beyond the hard limit are rejected.

## Manual verification

1. Sign in as each supported staff role and confirm only authorized categories.
2. Confirm a zero-result PDF shows a clear error and a populated report directly
   downloads a `.pdf` file.
3. Confirm PDF never opens the browser print dialog.
4. Print at 1366 px, 768 px, and 390 px viewport widths.
5. Verify headers, reporting period, Bagongpook context, Manila generation time,
   page breaks, and absence of navigation controls.
