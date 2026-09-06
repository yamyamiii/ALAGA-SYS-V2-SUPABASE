import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { PageHeading } from "@/components/common/PageHeading";
import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/authContext";
import {
  changePasswordDefaults,
  changePasswordSchema,
} from "@/features/auth/passwordSchemas";
import { getRoleLabel } from "@/features/auth/permissions";
import { profileFieldsSchema } from "@/features/user-management/schemas";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export default function AccountSettingsPage() {
  const auth = useAuth();
  const [serviceError, setServiceError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const query = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => profileService.getOwnProfile(),
  });
  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: {
      errors: profileErrors,
      isSubmitting: isProfileSubmitting,
      isDirty: isProfileDirty,
    },
  } = useForm({
    resolver: zodResolver(profileFieldsSchema),
    defaultValues: {
      first_name: "",
      middle_name: "",
      last_name: "",
      suffix: "",
      phone_number: "",
    },
  });
  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: changePasswordDefaults,
  });

  useEffect(() => {
    if (query.data) {
      resetProfile({
        first_name: query.data.first_name ?? "",
        middle_name: query.data.middle_name ?? "",
        last_name: query.data.last_name ?? "",
        suffix: query.data.suffix ?? "",
        phone_number: query.data.phone_number ?? "",
      });
    }
  }, [query.data, resetProfile]);

  async function save(values) {
    setServiceError(null);
    try {
      const updated = await profileService.updateOwnProfile(values);
      resetProfile({
        first_name: updated.first_name ?? "",
        middle_name: updated.middle_name ?? "",
        last_name: updated.last_name ?? "",
        suffix: updated.suffix ?? "",
        phone_number: updated.phone_number ?? "",
      });
      await auth.refreshProfile();
      toast.success("Account profile updated");
    } catch (error) {
      setServiceError(error);
    }
  }

  async function changePassword(values) {
    setPasswordError(null);
    try {
      await authService.changePassword({
        currentPassword: values.current_password,
        newPassword: values.new_password,
      });
      resetPassword(changePasswordDefaults);
      setShowPasswords(false);
      toast.success("Password updated successfully");
    } catch (error) {
      setPasswordError(error);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Account"
        title="Profile settings"
        description="Update your own safe personal information and password. Administrative role and account status are read-only."
      />

      {query.isLoading ? (
        <LoadingState
          title="Loading your profile"
          description="Retrieving your protected account details…"
        />
      ) : query.isError ? (
        <ErrorState
          title="Profile unavailable"
          description={query.error.message}
          actionLabel="Try again"
          onAction={() => query.refetch()}
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal information</CardTitle>
              </CardHeader>
              <CardContent>
                {serviceError ? (
                  <Alert variant="destructive" className="mb-5">
                    <AlertDescription>{serviceError.message}</AlertDescription>
                  </Alert>
                ) : null}
                <form
                  className="grid gap-5 sm:grid-cols-2"
                  onSubmit={handleProfileSubmit(save)}
                  noValidate
                >
                  <div className="space-y-2">
                    <Label htmlFor="account-first-name">First name</Label>
                    <Input
                      id="account-first-name"
                      autoComplete="given-name"
                      {...registerProfile("first_name")}
                    />
                    <FieldError error={profileErrors.first_name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-middle-name">Middle name</Label>
                    <Input
                      id="account-middle-name"
                      autoComplete="additional-name"
                      {...registerProfile("middle_name")}
                    />
                    <FieldError error={profileErrors.middle_name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-last-name">Last name</Label>
                    <Input
                      id="account-last-name"
                      autoComplete="family-name"
                      {...registerProfile("last_name")}
                    />
                    <FieldError error={profileErrors.last_name} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-suffix">Suffix</Label>
                    <Input
                      id="account-suffix"
                      autoComplete="honorific-suffix"
                      {...registerProfile("suffix")}
                    />
                    <FieldError error={profileErrors.suffix} />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="account-phone">Phone number</Label>
                    <Input
                      id="account-phone"
                      type="tel"
                      autoComplete="tel"
                      {...registerProfile("phone_number")}
                    />
                    <FieldError error={profileErrors.phone_number} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="submit"
                      disabled={isProfileSubmitting || !isProfileDirty}
                    >
                      {isProfileSubmitting ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Save />
                      )}
                      {isProfileSubmitting ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Change password</CardTitle>
              </CardHeader>
              <CardContent>
                {passwordError ? (
                  <Alert variant="destructive" className="mb-5">
                    <AlertDescription>{passwordError.message}</AlertDescription>
                  </Alert>
                ) : null}
                <form
                  className="grid gap-5 sm:grid-cols-2"
                  onSubmit={handlePasswordSubmit(changePassword)}
                  noValidate
                >
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type={showPasswords ? "text" : "password"}
                      autoComplete="current-password"
                      aria-invalid={Boolean(passwordErrors.current_password)}
                      {...registerPassword("current_password")}
                    />
                    <FieldError error={passwordErrors.current_password} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-new-password">New password</Label>
                    <div className="relative">
                      <Input
                        id="account-new-password"
                        type={showPasswords ? "text" : "password"}
                        autoComplete="new-password"
                        className="pr-11"
                        aria-invalid={Boolean(passwordErrors.new_password)}
                        {...registerPassword("new_password")}
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
                    <FieldError error={passwordErrors.new_password} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account-confirm-password">
                      Confirm new password
                    </Label>
                    <Input
                      id="account-confirm-password"
                      type={showPasswords ? "text" : "password"}
                      autoComplete="new-password"
                      aria-invalid={Boolean(passwordErrors.confirm_password)}
                      {...registerPassword("confirm_password")}
                    />
                    <FieldError error={passwordErrors.confirm_password} />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground sm:col-span-2">
                    Use at least 8 characters with uppercase, lowercase, and a
                    number.
                  </p>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={isPasswordSubmitting}>
                      {isPasswordSubmitting ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <KeyRound />
                      )}
                      {isPasswordSubmitting ? "Updating…" : "Update password"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Account access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Assigned role
                </p>
                <Badge className="mt-2" variant="outline">
                  {getRoleLabel(query.data.role)}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Account status
                </p>
                <Badge
                  className="mt-2"
                  variant={
                    query.data.account_status === "active"
                      ? "success"
                      : "secondary"
                  }
                >
                  {query.data.account_status}
                </Badge>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-secondary/60 p-3 text-xs leading-5 text-secondary-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Role and status changes require another active administrator and
                the trusted management service.
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
