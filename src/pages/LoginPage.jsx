import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { Brand } from "@/components/layout/Brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import { AuthLoadingScreen } from "@/features/auth/AuthLoadingScreen";
import { useAuth } from "@/features/auth/authContext";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  remember: z.boolean(),
});

function safeDestination(path) {
  return typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//")
    ? path
    : ROUTES.dashboard;
}

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: true },
  });

  if (auth.status === "loading") return <AuthLoadingScreen />;
  if (auth.status === "configuration-error") {
    return <Navigate to={ROUTES.configurationError} replace />;
  }
  if (auth.status === "error") {
    return <AuthLoadingScreen error={auth.error} onRetry={auth.retry} />;
  }
  if (auth.isAuthenticated) {
    return <Navigate to={safeDestination(location.state?.from)} replace />;
  }

  async function onSubmit(values) {
    setAuthError(null);
    try {
      await auth.signIn(values);
      navigate(safeDestination(location.state?.from), { replace: true });
    } catch (error) {
      setAuthError(error);
    }
  }

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_35%),radial-gradient(circle_at_80%_70%,white_0,transparent_30%)]" />
        <div className="relative">
          <Brand inverse />
        </div>
        <div className="relative max-w-xl">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-white/10">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="font-heading text-4xl font-semibold leading-tight">
            Secure healthcare coordination for your barangay.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-blue-100">
            Access protected community health information through your
            authorized ALAGA-SYS account.
          </p>
        </div>
        <p className="relative text-xs text-blue-100">
          Authorized personnel and residents only
        </p>
      </section>

      <section className="flex min-h-screen items-center justify-center p-5 sm:p-8 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
            <Brand />
          </div>
          <div className="mb-7 flex items-center gap-4 rounded-xl border border-dashed bg-muted/25 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground">
              LOGO
            </div>
            <div>
              <p className="text-sm font-semibold">Official barangay logo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reserved for the approved government seal
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Welcome back</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
              Sign in to ALAGA-SYS
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Use the account issued by your system administrator.
            </p>
          </div>

          <form
            className="mt-8 space-y-5"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            {authError ? (
              <Alert variant="destructive">
                <AlertDescription>{authError.message}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="name@example.com"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-11"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              {errors.password ? (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>
            <label className="flex cursor-pointer items-center gap-3 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                {...register("remember")}
              />
              Remember me on this device
            </label>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LockKeyhole />
              )}
              {isSubmitting ? "Signing in…" : "Sign in securely"}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
            ALAGA-SYS does not offer public staff registration. Contact your
            administrator if you need access.
          </p>
        </div>
      </section>
    </main>
  );
}
