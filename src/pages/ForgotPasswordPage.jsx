import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Mail, RotateCw } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";

import { OfficialLogo } from "@/components/common/OfficialLogo";
import { Brand } from "@/components/layout/Brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import { authService } from "@/services/authService";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .max(254, "Email is too long.")
    .email("Enter a valid email address."),
});

const GENERIC_SUCCESS =
  "If an account exists for that email, a password reset link has been sent.";

export default function ForgotPasswordPage() {
  const [requestError, setRequestError] = useState(null);
  const [sent, setSent] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const requestLock = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function sendResetLink(values) {
    if (requestLock.current) return;
    requestLock.current = true;
    setRequestPending(true);
    setRequestError(null);
    try {
      await authService.requestPasswordReset(values.email);
      setSent(true);
    } catch (error) {
      setRequestError(error);
    } finally {
      requestLock.current = false;
      setRequestPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-5 sm:p-8">
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <Brand />
          <OfficialLogo className="h-16 w-16 shrink-0 rounded-xl bg-white" />
        </div>
        <p className="mt-8 text-sm font-semibold text-primary">
          Account recovery
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Forgot your password?
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enter your account email. If it is eligible for recovery, Supabase
          will send a secure, time-limited reset link.
        </p>

        <form
          className="mt-7 space-y-5"
          onSubmit={handleSubmit(sendResetLink)}
          noValidate
        >
          {sent ? (
            <Alert>
              <AlertDescription>{GENERIC_SUCCESS}</AlertDescription>
            </Alert>
          ) : null}
          {requestError ? (
            <Alert variant="destructive">
              <AlertDescription>{requestError.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="recovery-email">Email</Label>
            <Input
              id="recovery-email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting || requestPending}
          >
            {isSubmitting || requestPending ? (
              <LoaderCircle className="animate-spin" />
            ) : sent ? (
              <RotateCw />
            ) : (
              <Mail />
            )}
            {isSubmitting || requestPending
              ? "Sending…"
              : sent
                ? "Send reset link again"
                : "Send reset link"}
          </Button>
        </form>

        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link to={ROUTES.login}>Back to sign in</Link>
        </Button>
      </section>
    </main>
  );
}
