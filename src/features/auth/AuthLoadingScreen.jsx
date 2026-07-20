import { AlertCircle, LoaderCircle } from "lucide-react";

import { Brand } from "@/components/layout/Brand";
import { Button } from "@/components/ui/button";

export function AuthLoadingScreen({ error, onRetry }) {
  const isError = Boolean(error);
  const Icon = isError ? AlertCircle : LoaderCircle;

  return (
    <main className="bg-dashboard-pattern flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="flex justify-center">
          <Brand />
        </div>
        <div className="mx-auto mt-8 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className={isError ? "h-5 w-5" : "h-5 w-5 animate-spin"} />
        </div>
        <h1 className="mt-4 font-heading text-lg font-semibold">
          {isError
            ? "Session verification unavailable"
            : "Securing your session"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isError
            ? error.message
            : "Please wait while ALAGA-SYS verifies your account."}
        </p>
        {isError && onRetry ? (
          <Button className="mt-5" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </main>
  );
}
