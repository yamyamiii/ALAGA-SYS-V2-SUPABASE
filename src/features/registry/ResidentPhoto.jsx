import { ImageOff, LoaderCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useResidentPhoto } from "@/features/registry/hooks";
import { formatPersonName } from "@/features/registry/formatters";
import { cn } from "@/lib/utils";

function initials(resident) {
  return (
    `${resident?.first_name?.[0] ?? ""}${resident?.last_name?.[0] ?? ""}`.toUpperCase() ||
    "R"
  );
}

export function ResidentPhoto({ resident, className, enabled = true }) {
  const query = useResidentPhoto(resident?.photo_path, enabled);
  const name = formatPersonName(resident);

  return (
    <Avatar className={cn("h-16 w-16 border bg-background", className)}>
      {query.data ? (
        <AvatarImage
          src={query.data}
          alt={`Photo of ${name}`}
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <AvatarFallback aria-label={`${name} initials`}>
        {query.isLoading ? (
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : query.isError ? (
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        ) : (
          initials(resident)
        )}
      </AvatarFallback>
    </Avatar>
  );
}
