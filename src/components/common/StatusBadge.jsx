import { Badge } from "@/components/ui/badge";

const statusVariants = {
  active: "success",
  completed: "success",
  pending: "warning",
  invited: "warning",
  inactive: "secondary",
  suspended: "destructive",
  cancelled: "destructive",
};

export function StatusBadge({ status }) {
  const normalizedStatus = status?.toLowerCase() ?? "inactive";
  return (
    <Badge variant={statusVariants[normalizedStatus] ?? "outline"}>
      {status ?? "Unknown"}
    </Badge>
  );
}
