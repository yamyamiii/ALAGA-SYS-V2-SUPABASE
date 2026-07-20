import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { PageHeading } from "@/components/common/PageHeading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/authContext";
import { getRoleLabel } from "@/features/auth/permissions";
import { profileFieldsSchema } from "@/features/user-management/schemas";
import { profileService } from "@/services/profileService";

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export default function AccountSettingsPage() {
  const auth = useAuth();
  const [serviceError, setServiceError] = useState(null);
  const query = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => profileService.getOwnProfile(),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
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

  useEffect(() => {
    if (query.data) {
      reset({
        first_name: query.data.first_name ?? "",
        middle_name: query.data.middle_name ?? "",
        last_name: query.data.last_name ?? "",
        suffix: query.data.suffix ?? "",
        phone_number: query.data.phone_number ?? "",
      });
    }
  }, [query.data, reset]);

  async function save(values) {
    setServiceError(null);
    try {
      const updated = await profileService.updateOwnProfile(values);
      reset({
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

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Account"
        title="Profile settings"
        description="Update your own safe personal information. Administrative role and account status are read-only."
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
                onSubmit={handleSubmit(save)}
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="account-first-name">First name</Label>
                  <Input
                    id="account-first-name"
                    autoComplete="given-name"
                    {...register("first_name")}
                  />
                  <FieldError error={errors.first_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-middle-name">Middle name</Label>
                  <Input
                    id="account-middle-name"
                    autoComplete="additional-name"
                    {...register("middle_name")}
                  />
                  <FieldError error={errors.middle_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-last-name">Last name</Label>
                  <Input
                    id="account-last-name"
                    autoComplete="family-name"
                    {...register("last_name")}
                  />
                  <FieldError error={errors.last_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-suffix">Suffix</Label>
                  <Input
                    id="account-suffix"
                    autoComplete="honorific-suffix"
                    {...register("suffix")}
                  />
                  <FieldError error={errors.suffix} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="account-phone">Phone number</Label>
                  <Input
                    id="account-phone"
                    type="tel"
                    autoComplete="tel"
                    {...register("phone_number")}
                  />
                  <FieldError error={errors.phone_number} />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    {isSubmitting ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

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
