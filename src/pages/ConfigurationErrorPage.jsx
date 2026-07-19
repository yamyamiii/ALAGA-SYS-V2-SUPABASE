import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { PageHeading } from "@/components/common/PageHeading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";

export default function ConfigurationErrorPage() {
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Environment setup"
        title="Supabase configuration required"
        description="Use this guide when a future Supabase-backed service reports missing public configuration."
      />
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Public environment values are not connected</AlertTitle>
        <AlertDescription>
          Phase 0 does not require a live connection. Never place a service-role
          key or secret key in this frontend.
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
            <Label htmlFor="supabase-key">VITE_SUPABASE_PUBLISHABLE_KEY</Label>
            <Input
              id="supabase-key"
              value="Your publishable key"
              readOnly
              aria-readonly="true"
            />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Copy{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">.env.example</code>{" "}
            to a local environment file in a later phase, and keep that file
            untracked.
          </p>
          <Button asChild variant="outline">
            <Link to={ROUTES.dashboard}>
              <ArrowLeft /> Return to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
