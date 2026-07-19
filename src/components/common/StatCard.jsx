import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  icon: Icon,
  helper = "Awaiting connected data",
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p
              className="mt-3 text-3xl font-semibold tracking-tight"
              aria-label="No data"
            >
              —
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Badge variant="secondary">Preview</Badge>
          <span className="truncate text-xs text-muted-foreground">
            {helper}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
