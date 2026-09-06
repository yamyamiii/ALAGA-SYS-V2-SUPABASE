import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";

import { OfficialLogo } from "@/components/common/OfficialLogo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import {
  resetPasswordDefaults,
  resetPasswordSchema,
} from "@/features/auth/passwordSchemas";
import { authService } from "@/services/authService";

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [recoveryState, setRecoveryState] = useState("checking");
  const [recoveryError, setRecoveryError] = useState(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: resetPasswordDefaults,
  });

  useEffect(() => {
    let active = true;
    authService
      .establishPasswordRecovery()
      .then(() => {
        if (active) setRecoveryState("ready");
      })
      .catch((error) => {
        if (active) {
          setRecoveryError(error);
          setRecoveryState("invalid");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (recoveryState !== "success") return undefined;
    const timeout = window.setTimeout(
      () => navigate(ROUTES.login, { replace: true }),
      1_500,
    );
    return () => window.clearTimeout(timeout);
  }, [navigate, recoveryState]);

  async function updatePassword(values) {
    setRecoveryError(null);
    try {
      await authService.completePasswordRecovery(values.new_password);
      setRecoveryState("success");
    } catch (error) {
      setRecoveryError(error);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5 sm:p-8">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
        <OfficialLogo className="mx-auto h-20 w-20 rounded-2xl bg-white" />
        <h1 className="mt-6 text-center font-heading text-3xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
          Recovery links are time-limited and can be used only to update the
          linked ALAGA-SYS account.
        </p>

        {recoveryState === "checking" ? (
          <div className="mt-7 flex items-center justify-center gap-2 rounded-xl border p-5 text-sm text-muted-foreground">
            <LoaderCircle className="animate-spin" /> Verifying reset link…
          </div>
        ) : null}

        {recoveryState === "invalid" ? (
          <div className="mt-7 space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{recoveryError?.message}</AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link to={ROUTES.forgotPassword}>Request a new reset link</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to={ROUTES.login}>Back to sign in</Link>
            </Button>
          </div>
        ) : null}

        {recoveryState === "success" ? (
          <Alert className="mt-7">
            <AlertDescription>
              Password updated successfully. Redirecting you to sign in…
            </AlertDescription>
          </Alert>
        ) : null}

        {recoveryState === "ready" ? (
          <form
            className="mt-7 space-y-5"
            onSubmit={handleSubmit(updatePassword)}
            noValidate
          >
            {recoveryError ? (
              <Alert variant="destructive">
                <AlertDescription>{recoveryError.message}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-11"
                  aria-invalid={Boolean(errors.new_password)}
                  {...register("new_password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPasswords((current) => !current)}
                  aria-label={
                    showPasswords ? "Hide passwords" : "Show passwords"
                  }
                >
                  {showPasswords ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              <FieldError error={errors.new_password} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input
                id="confirm-new-password"
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.confirm_password)}
                {...register("confirm_password")}
              />
              <FieldError error={errors.confirm_password} />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Use at least 8 characters with uppercase, lowercase, and a number.
            </p>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <KeyRound />
              )}
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
