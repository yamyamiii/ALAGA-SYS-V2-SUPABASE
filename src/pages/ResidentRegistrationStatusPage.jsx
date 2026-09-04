import { Clock3, LogIn } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";

import { OfficialLogo } from "@/components/common/OfficialLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth/authContext";
import { AuthLoadingScreen } from "@/features/auth/AuthLoadingScreen";

export default function ResidentRegistrationStatusPage() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") return <AuthLoadingScreen />;
  if (auth.status === "configuration-error") {
    return <Navigate to={ROUTES.configurationError} replace />;
  }
  if (auth.status === "error") {
    return <AuthLoadingScreen error={auth.error} onRetry={auth.retry} />;
  }
  if (auth.isAuthenticated) return <Navigate to={ROUTES.dashboard} replace />;

  const rejected = location.state?.registrationStatus === "rejected";
  const emailConfirmationRequired = Boolean(
    location.state?.emailConfirmationRequired,
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5 sm:p-8">
      <Card className="w-full max-w-lg shadow-lg">
        <CardContent className="p-6 text-center sm:p-9">
          <OfficialLogo className="mx-auto h-24 w-24 rounded-2xl bg-white" />
          <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock3 className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-semibold">
            {rejected
              ? "Registration needs assistance"
              : "Registration pending verification"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {rejected
              ? "Your Resident registration was not approved. Contact the Barangay Health Center if you believe this needs review."
              : "An Administrator must review and verify your Resident information before your ALAGA-SYS account can access resident services."}
          </p>
          {emailConfirmationRequired && !rejected ? (
            <p className="mt-4 rounded-lg border bg-muted/40 px-4 py-3 text-sm leading-6">
              Account created. Please check your email and confirm your email
              address. After confirmation, your Resident registration will
              remain pending until approved by the Barangay Health Center.
            </p>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Pending accounts cannot view other Residents, appointments, or
            private health information.
          </p>
          <Button asChild className="mt-7 w-full sm:w-auto">
            <Link to={ROUTES.login} replace>
              <LogIn /> Return to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
