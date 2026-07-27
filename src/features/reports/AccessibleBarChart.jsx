import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AccessibleBarChart({ title, description, data = [] }) {
  const maximum = Math.max(...data.map(({ value }) => Number(value) || 0), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        <div
          role="img"
          aria-label={`${title}. ${data
            .map(({ label, value }) => `${label}: ${value}`)
            .join(", ")}`}
          className="space-y-3"
        >
          {data.map(({ label, value }) => (
            <div
              key={label}
              className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3"
            >
              <span className="truncate text-xs text-muted-foreground">
                {label}
              </span>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.max((Number(value) / maximum) * 100, value ? 2 : 0)}%`,
                  }}
                />
              </div>
              <span className="min-w-8 text-right text-sm font-semibold">
                {value}
              </span>
            </div>
          ))}
        </div>
        <details className="mt-5 print:block">
          <summary className="cursor-pointer text-xs font-medium text-primary print:hidden">
            View accessible data table
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-2 pr-4">
                    Category
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map(({ label, value }) => (
                  <tr key={label} className="border-b last:border-0">
                    <td className="py-2 pr-4">{label}</td>
                    <td className="py-2 text-right">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
