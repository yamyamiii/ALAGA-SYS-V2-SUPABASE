import { ArrowLeft, ShieldX } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";

export default function AccessDeniedPage() {
  const location = useLocation();

  return (
    <div className="flex min-h-[calc(100dvh-136px)] items-center justify-center py-10">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldX className="h-8 w-8" />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-destructive">
          Access denied
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          You do not have permission to view this page
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your account is active, but its assigned role cannot access
          {location.state?.attemptedPath
            ? ` ${location.state.attemptedPath}`
            : " this section"}
          .
        </p>
        <Button asChild className="mt-6">
          <Link to={ROUTES.dashboard}>
            <ArrowLeft /> Return to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
