import { ArrowLeft, SearchX } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/config/routes";

export default function NotFoundPage() {
  return (
    <main className="bg-dashboard-pattern flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SearchX className="h-8 w-8" />
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          404 error
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The page may have moved, or this module has not been added to
          ALAGA-SYS yet.
        </p>
        <Button asChild className="mt-6">
          <Link to={ROUTES.dashboard}>
            <ArrowLeft /> Return to dashboard
          </Link>
        </Button>
      </div>
    </main>
  );
}
