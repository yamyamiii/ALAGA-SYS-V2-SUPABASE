import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  MailCheck,
  UserRoundPlus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { OfficialLogo } from "@/components/common/OfficialLogo";
import { Brand } from "@/components/layout/Brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import { useAuth } from "@/features/auth/authContext";
import { AuthLoadingScreen } from "@/features/auth/AuthLoadingScreen";
import {
  residentRegistrationDefaults,
  residentRegistrationSchema,
} from "@/features/auth/residentRegistrationSchema";
import { authService } from "@/services/authService";
import { residentRegistrationService } from "@/services/residentRegistrationService";

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export default function ResidentRegistrationPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [puroks, setPuroks] = useState([]);
  const [localityError, setLocalityError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [resendFeedback, setResendFeedback] = useState(null);
  const [registrationPending, setRegistrationPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const registrationLock = useRef(false);
  const resendLock = useRef(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(residentRegistrationSchema),
    defaultValues: residentRegistrationDefaults,
  });

  useEffect(() => {
    let active = true;
    residentRegistrationService
      .listPuroks()
      .then((items) => {
        if (active) setPuroks(items);
      })
      .catch((error) => {
        if (active) setLocalityError(error);
      });
    return () => {
      active = false;
    };
  }, []);

  if (auth.status === "loading") return <AuthLoadingScreen />;
  if (auth.status === "configuration-error") {
    return <Navigate to={ROUTES.configurationError} replace />;
  }
  if (auth.status === "error") {
    return <AuthLoadingScreen error={auth.error} onRetry={auth.retry} />;
  }
  if (auth.isAuthenticated) return <Navigate to={ROUTES.dashboard} replace />;

  async function onSubmit(values) {
    if (registrationLock.current) return;
    registrationLock.current = true;
    setRegistrationPending(true);
    setSubmitError(null);
    setResendFeedback(null);
    try {
      const result = await residentRegistrationService.register(values);
      navigate(ROUTES.registrationStatus, {
        replace: true,
        state: {
          registrationStatus: result.status,
          emailConfirmationRequired: result.emailConfirmationRequired,
        },
      });
    } catch (error) {
      setSubmitError(error);
    } finally {
      registrationLock.current = false;
      setRegistrationPending(false);
    }
  }

  async function resendConfirmation() {
    if (resendLock.current) return;
    resendLock.current = true;
    setResendPending(true);
    setResendFeedback(null);
    try {
      await authService.resendConfirmation(getValues("email"));
      setResendFeedback({
        kind: "success",
        message:
          "If confirmation is still required, a new confirmation email has been sent.",
      });
    } catch (error) {
      setResendFeedback({ kind: "error", message: error.message });
    } finally {
      resendLock.current = false;
      setResendPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(300px,0.7fr)_minmax(0,1.3fr)]">
      <section className="hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Brand inverse />
        <div>
          <h1 className="font-heading text-3xl font-semibold">
            Resident access begins with verification.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-blue-100">
            Submit your own information for review by the Barangay Health
            Center. Registration never creates a staff account or immediate
            access to private records.
          </p>
        </div>
        <p className="text-xs text-blue-100">Brgy. Bagongpook residents only</p>
      </section>

      <section className="px-5 py-6 sm:px-8 sm:py-10 lg:px-12">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-7 flex items-center justify-between gap-4">
            <div className="lg:hidden">
              <Brand />
            </div>
            <Button asChild variant="ghost" size="sm" className="ml-auto">
              <Link to={ROUTES.login}>Back to sign in</Link>
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <OfficialLogo className="h-20 w-20 shrink-0 rounded-xl bg-white" />
            <div>
              <p className="text-sm font-semibold text-primary">
                Resident registration
              </p>
              <h2 className="mt-1 font-heading text-2xl font-semibold sm:text-3xl">
                Create a resident account
              </h2>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Your account remains pending until an Administrator verifies your
            details and creates or links your Resident record.
          </p>

          <form
            className="mt-8 space-y-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            {submitError ? (
              <Alert variant="destructive">
                <AlertDescription className="space-y-3">
                  <p>{submitError.message}</p>
                  {["email_send_rate_limited", "account_may_exist"].includes(
                    submitError.code,
                  ) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resendPending}
                      onClick={resendConfirmation}
                    >
                      {resendPending ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <MailCheck />
                      )}
                      {resendPending ? "Sending…" : "Resend confirmation email"}
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {resendFeedback ? (
              <Alert
                variant={
                  resendFeedback.kind === "error" ? "destructive" : "default"
                }
              >
                <AlertDescription>{resendFeedback.message}</AlertDescription>
              </Alert>
            ) : null}

            <fieldset className="space-y-4">
              <legend className="font-heading text-lg font-semibold">
                Account
              </legend>
              <div className="space-y-2">
                <Label htmlFor="registration-email">Email</Label>
                <Input
                  id="registration-email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  {...register("email")}
                />
                <FieldError error={errors.email} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registration-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="registration-password"
                      type={showPasswords ? "text" : "password"}
                      autoComplete="new-password"
                      className="pr-11"
                      aria-invalid={Boolean(errors.password)}
                      {...register("password")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      aria-label={
                        showPasswords ? "Hide passwords" : "Show passwords"
                      }
                      onClick={() => setShowPasswords((current) => !current)}
                    >
                      {showPasswords ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  <FieldError error={errors.password} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-confirm-password">
                    Confirm password
                  </Label>
                  <Input
                    id="registration-confirm-password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.confirm_password)}
                    {...register("confirm_password")}
                  />
                  <FieldError error={errors.confirm_password} />
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Use at least 8 characters with uppercase, lowercase, and a
                number.
              </p>
            </fieldset>

            <fieldset className="space-y-4 border-t pt-7">
              <legend className="font-heading text-lg font-semibold">
                Resident information
              </legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="registration-first-name">First name</Label>
                  <Input
                    id="registration-first-name"
                    autoComplete="given-name"
                    aria-invalid={Boolean(errors.first_name)}
                    {...register("first_name")}
                  />
                  <FieldError error={errors.first_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-middle-name">
                    Middle name (optional)
                  </Label>
                  <Input
                    id="registration-middle-name"
                    autoComplete="additional-name"
                    {...register("middle_name")}
                  />
                  <FieldError error={errors.middle_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-last-name">Last name</Label>
                  <Input
                    id="registration-last-name"
                    autoComplete="family-name"
                    aria-invalid={Boolean(errors.last_name)}
                    {...register("last_name")}
                  />
                  <FieldError error={errors.last_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-date-of-birth">
                    Date of birth
                  </Label>
                  <Input
                    id="registration-date-of-birth"
                    type="date"
                    aria-invalid={Boolean(errors.date_of_birth)}
                    {...register("date_of_birth")}
                  />
                  <FieldError error={errors.date_of_birth} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-sex">Sex</Label>
                  <select
                    id="registration-sex"
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-invalid={Boolean(errors.sex)}
                    {...register("sex")}
                  >
                    <option value="">Select sex</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                  <FieldError error={errors.sex} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-phone">
                    Phone number (optional)
                  </Label>
                  <Input
                    id="registration-phone"
                    type="tel"
                    autoComplete="tel"
                    aria-invalid={Boolean(errors.phone_number)}
                    {...register("phone_number")}
                  />
                  <FieldError error={errors.phone_number} />
                </div>
              </div>
            </fieldset>

            <fieldset className="space-y-4 border-t pt-7">
              <legend className="font-heading text-lg font-semibold">
                Locality
              </legend>
              <p className="text-sm text-muted-foreground">
                Barangay: <strong>Bagongpook</strong>
              </p>
              {localityError ? (
                <Alert variant="destructive">
                  <AlertDescription>{localityError.message}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registration-purok">Purok</Label>
                  <select
                    id="registration-purok"
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    disabled={Boolean(localityError) || puroks.length === 0}
                    aria-invalid={Boolean(errors.purok_id)}
                    {...register("purok_id")}
                  >
                    <option value="">
                      {puroks.length ? "Select purok" : "Loading puroks…"}
                    </option>
                    {puroks.map((purok) => (
                      <option key={purok.id} value={purok.id}>
                        {purok.name}
                      </option>
                    ))}
                  </select>
                  <FieldError error={errors.purok_id} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-address">
                    Address (optional)
                  </Label>
                  <Input
                    id="registration-address"
                    autoComplete="street-address"
                    aria-invalid={Boolean(errors.address_line)}
                    {...register("address_line")}
                  />
                  <FieldError error={errors.address_line} />
                </div>
              </div>
            </fieldset>

            <div className="rounded-xl border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
              Submitting this form creates only a pending Resident account.
              Staff roles are issued separately by the Barangay Health Center.
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={
                isSubmitting ||
                registrationPending ||
                Boolean(localityError) ||
                puroks.length !== 7
              }
            >
              {isSubmitting || registrationPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <UserRoundPlus />
              )}
              {isSubmitting || registrationPending
                ? "Submitting…"
                : "Create resident account"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
