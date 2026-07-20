import { Skeleton } from "@/components/ui/skeleton";

export function RegistrySkeleton() {
  return (
    <div
      className="space-y-3 p-4"
      role="status"
      aria-label="Loading registry records"
      aria-live="polite"
      aria-busy="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-xl border p-4"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-44 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}
