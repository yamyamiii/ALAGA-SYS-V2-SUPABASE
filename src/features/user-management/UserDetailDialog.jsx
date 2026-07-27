import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  LoaderCircle,
  MailCheck,
  Pencil,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/common/StateDisplay";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRoleLabel } from "@/features/auth/permissions";
import { profileFieldsSchema } from "@/features/user-management/schemas";
import { useDialogDraftLifecycle } from "@/hooks/useDialogDraftLifecycle";
import { userManagementService } from "@/services/userManagementService";

const profileDefaults = {
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  phone_number: "",
};

function displayDate(value, includeTime = false) {
  if (!value) return "Never";
  return format(
    new Date(value),
    includeTime ? "MMM d, yyyy, h:mm a" : "MMM d, yyyy",
  );
}

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export function UserDetailDialog({
  userId,
  open,
  onOpenChange,
  onChanged,
  onRequestRole,
  onRequestStatus,
  currentUserId,
}) {
  const [editing, setEditing] = useState(false);
  const [serviceError, setServiceError] = useState(null);
  const [resending, setResending] = useState(false);
  const initializedUserId = useRef(null);
  const query = useQuery({
    queryKey: ["managed-user", userId],
    queryFn: () => userManagementService.getUser(userId),
    enabled: open && Boolean(userId),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(profileFieldsSchema),
    defaultValues: profileDefaults,
  });

  function resetUserForm(user = query.data) {
    reset(
      user
        ? {
            first_name: user.first_name ?? "",
            middle_name: user.middle_name ?? "",
            last_name: user.last_name ?? "",
            suffix: user.suffix ?? "",
            phone_number: user.phone_number ?? "",
          }
        : profileDefaults,
    );
  }

  useDialogDraftLifecycle({
    open,
    draftKey: userId ?? "none",
    resetDraft: () => {
      initializedUserId.current = null;
      setEditing(false);
      setServiceError(null);
      resetUserForm(null);
    },
  });

  useEffect(() => {
    if (
      !open ||
      !query.data ||
      query.data.id !== userId ||
      initializedUserId.current === userId
    ) {
      return;
    }
    resetUserForm(query.data);
    initializedUserId.current = userId;
  }, [open, query.data, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(values) {
    setServiceError(null);
    try {
      await userManagementService.updateProfile(userId, values);
      toast.success("Profile updated");
      setEditing(false);
      reset(values);
      await query.refetch();
      onChanged();
    } catch (error) {
      setServiceError(error);
    }
  }

  async function resend() {
    setResending(true);
    setServiceError(null);
    try {
      await userManagementService.resendInvitation(userId);
      toast.success("Invitation sent again");
      await query.refetch();
      onChanged();
    } catch (error) {
      setServiceError(error);
    } finally {
      setResending(false);
    }
  }

  const user = query.data;
  const isSelf = user?.id === currentUserId;

  return (
    <Dialog
      open={open}
      onOpenChange={isSubmitting || resending ? undefined : onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User details</DialogTitle>
          <DialogDescription>
            Only approved Auth and profile fields are returned by the trusted
            service.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <LoadingState
            compact
            title="Loading user"
            description="Retrieving the sanitized account record…"
          />
        ) : query.isError ? (
          <ErrorState
            compact
            title="User unavailable"
            description={query.error.message}
            actionLabel="Try again"
            onAction={() => query.refetch()}
          />
        ) : user ? (
          <div className="space-y-6">
            {serviceError ? (
              <Alert variant="destructive">
                <AlertDescription>{serviceError.message}</AlertDescription>
              </Alert>
            ) : null}

            <div className="rounded-xl border bg-muted/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-heading text-lg font-semibold">
                    {[
                      user.first_name,
                      user.middle_name,
                      user.last_name,
                      user.suffix,
                    ]
                      .filter(Boolean)
                      .join(" ") || "Unnamed user"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{getRoleLabel(user.role)}</Badge>
                  <Badge
                    variant={
                      user.account_status === "active"
                        ? "success"
                        : user.account_status === "suspended"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {user.account_status}
                  </Badge>
                </div>
              </div>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Phone number</dt>
                  <dd className="mt-1 font-medium">
                    {user.phone_number || "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last login</dt>
                  <dd className="mt-1 font-medium">
                    {displayDate(user.last_login_at, true)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="mt-1 font-medium">
                    {displayDate(user.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status changed</dt>
                  <dd className="mt-1 font-medium">
                    {displayDate(user.status_changed_at, true)}
                  </dd>
                </div>
              </dl>
            </div>

            {editing ? (
              <form
                id="managed-profile-form"
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={handleSubmit(save)}
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="detail-first-name">First name</Label>
                  <Input id="detail-first-name" {...register("first_name")} />
                  <FieldError error={errors.first_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detail-middle-name">Middle name</Label>
                  <Input id="detail-middle-name" {...register("middle_name")} />
                  <FieldError error={errors.middle_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detail-last-name">Last name</Label>
                  <Input id="detail-last-name" {...register("last_name")} />
                  <FieldError error={errors.last_name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detail-suffix">Suffix</Label>
                  <Input id="detail-suffix" {...register("suffix")} />
                  <FieldError error={errors.suffix} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="detail-phone">Phone number</Label>
                  <Input
                    id="detail-phone"
                    type="tel"
                    {...register("phone_number")}
                  />
                  <FieldError error={errors.phone_number} />
                </div>
              </form>
            ) : null}

            {!editing ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  <Pencil /> Edit safe profile fields
                </Button>
                {user.account_status === "invited" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resend}
                    disabled={resending}
                  >
                    {resending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <MailCheck />
                    )}
                    {resending ? "Sending…" : "Resend invitation"}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRequestRole(user)}
                  disabled={isSelf}
                >
                  <RefreshCw /> Change role
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRequestStatus(user)}
                  disabled={isSelf}
                >
                  <ShieldAlert /> Change status
                </Button>
              </div>
            ) : null}

            {isSelf ? (
              <p className="text-xs leading-5 text-muted-foreground">
                Use Account settings for your own safe profile fields. Your own
                role and status cannot be changed here.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {editing ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetUserForm();
                  setEditing(false);
                }}
                disabled={isSubmitting}
              >
                Cancel editing
              </Button>
              <Button
                type="submit"
                form="managed-profile-form"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Pencil />
                )}
                {isSubmitting ? "Saving…" : "Save profile"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
