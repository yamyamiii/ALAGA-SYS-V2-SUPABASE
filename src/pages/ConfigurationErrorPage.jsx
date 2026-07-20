import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

import { Brand } from "@/components/layout/Brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import { hasSupabaseConfiguration } from "@/lib/supabase/client";

export default function ConfigurationErrorPage() {
  if (hasSupabaseConfiguration) {
    return <Navigate to={ROUTES.login} replace />;
  }

  return (
    <main className="bg-dashboard-pattern min-h-dvh p-6 sm:p-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Brand />
        <div>
          <p className="text-sm font-semibold text-primary">
            Environment setup
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold">
            Supabase configuration required
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Authentication cannot start until the public project connection is
            configured.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Public environment values are not connected</AlertTitle>
          <AlertDescription>
            Never place a service-role key or secret key in this frontend.
          </AlertDescription>
        </Alert>
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Expected local variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="supabase-url">VITE_SUPABASE_URL</Label>
              <Input
                id="supabase-url"
                value="Your project URL"
                readOnly
                aria-readonly="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supabase-key">
                VITE_SUPABASE_PUBLISHABLE_KEY
              </Label>
              <Input
                id="supabase-key"
                value="Your publishable key"
                readOnly
                aria-readonly="true"
              />
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Copy{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                .env.example
              </code>{" "}
              to a local environment file, add the project&apos;s public values,
              and keep that file untracked.
            </p>
            <Button asChild variant="outline">
              <Link to={ROUTES.login}>
                <ArrowLeft /> Return to sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
