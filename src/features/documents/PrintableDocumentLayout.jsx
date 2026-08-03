import { DocumentFooter } from "@/features/documents/DocumentFooter";
import { DocumentHeader } from "@/features/documents/DocumentHeader";
import { SignatureBlock } from "@/features/documents/SignatureBlock";

function FieldGrid({ fields = [] }) {
  return (
    <dl className="document-field-grid">
      {fields.map((field) => (
        <div key={field.label} className="page-break-avoid min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {field.label}
          </dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DocumentTable({ table }) {
  if (!table.rows.length) {
    return <p className="text-sm italic text-slate-500">{table.empty}</p>;
  }
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="document-table">
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${table.columns[0]?.key}`}>
              {table.columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrintableDocumentLayout({ model }) {
  return (
    <article
      className="printable-document relative mx-auto bg-white text-slate-900"
      data-print-document
      aria-label={`${model.title} preview`}
    >
      <span className="document-watermark" aria-hidden="true">
        ALAGA-SYS
      </span>
      <DocumentHeader title={model.title} identifier={model.identifier} />
      <main className="relative z-10 mt-6 space-y-6">
        <FieldGrid fields={model.fields} />
        {model.sections.map((section) => (
          <section key={section.title} className="document-section">
            <h3>{section.title}</h3>
            {section.note ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {section.note}
              </p>
            ) : null}
            {section.fields ? <FieldGrid fields={section.fields} /> : null}
            {section.table ? <DocumentTable table={section.table} /> : null}
          </section>
        ))}
        <SignatureBlock signature={model.signature} />
      </main>
      <DocumentFooter model={model} />
    </article>
  );
}
