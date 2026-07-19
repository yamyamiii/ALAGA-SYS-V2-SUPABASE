import { cn } from "@/lib/utils";

export function ContentContainer({ className, children }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1600px]", className)}>
      {children}
    </div>
  );
}
