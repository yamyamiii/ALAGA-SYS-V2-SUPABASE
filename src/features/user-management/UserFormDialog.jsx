import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, MailPlus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { getRoleLabel, USER_ROLES } from "@/features/auth/permissions";
import {
  createUserSchema,
  inviteUserSchema,
} from "@/features/user-management/schemas";
import { userManagementService } from "@/services/userManagementService";

const defaults = {
  email: "",
  role: USER_ROLES.RESIDENT,
  first_name: "",
  middle_name: "",
  last_name: "",
  suffix: "",
  phone_number: "",
  temporary_password: "",
};

function FieldError({ error }) {
  return error ? (
    <p className="text-xs text-destructive">{error.message}</p>
  ) : null;
}

export function UserFormDialog({ open, onOpenChange, onSuccess }) {
  const [mode, setMode] = useState("invite");
  const [showPassword, setShowPassword] = useState(false);
  const [serviceError, setServiceError] = useState(null);
  const schema = mode === "invite" ? inviteUserSchema : createUserSchema;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (open) {
      reset(defaults);
      setMode("invite");
      setServiceError(null);
      setShowPassword(false);
    }
  }, [open, reset]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setServiceError(null);
    reset(defaults);
  }

  async function submit(values) {
    setServiceError(null);
    try {
      if (mode === "invite") {
        await userManagementService.inviteUser(values);
        toast.success("Invitation sent", {
          description:
            "The account remains invited until an administrator activates it.",
        });
      } else {
        await userManagementService.createUser(values);
        toast.success("Account created", {
          description:
            "Hand off the temporary password securely and require an immediate change.",
        });
      }
      reset(defaults);
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      setServiceError(error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={isSubmitting ? undefined : onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a trusted user</DialogTitle>
          <DialogDescription>
            Invitations are preferred. Every role is independently validated by
            the trusted server workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
          <Button
            type="button"
            variant={mode === "invite" ? "default" : "ghost"}
            onClick={() => changeMode("invite")}
          >
            <MailPlus /> Invite by email
          </Button>
          <Button
            type="button"
            variant={mode === "create" ? "default" : "ghost"}
            onClick={() => changeMode("create")}
          >
            <UserPlus /> Temporary password
          </Button>
        </div>

        {serviceError ? (
          <Alert variant="destructive">
            <AlertDescription>{serviceError.message}</AlertDescription>
          </Alert>
        ) : null}

        {mode === "create" ? (
          <Alert>
            <AlertDescription>
              The temporary password is submitted once and is never returned by
              ALAGA-SYS. Share it through a separate secure channel.
            </AlertDescription>
          </Alert>
        ) : null}

        <form
          id="user-provisioning-form"
          className="space-y-5"
          onSubmit={handleSubmit(submit)}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="managed-email">Email</Label>
              <Input
                id="managed-email"
                type="email"
                autoComplete="off"
                {...register("email")}
              />
              <FieldError error={errors.email} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="managed-role">Role</Label>
              <select
                id="managed-role"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                {...register("role")}
              >
                {Object.values(USER_ROLES).map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
              <FieldError error={errors.role} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="managed-first-name">First name</Label>
              <Input
                id="managed-first-name"
                autoComplete="off"
                {...register("first_name")}
              />
              <FieldError error={errors.first_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="managed-middle-name">Middle name</Label>
              <Input
                id="managed-middle-name"
                autoComplete="off"
                {...register("middle_name")}
              />
              <FieldError error={errors.middle_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="managed-last-name">Last name</Label>
              <Input
                id="managed-last-name"
                autoComplete="off"
                {...register("last_name")}
              />
              <FieldError error={errors.last_name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="managed-suffix">Suffix</Label>
              <Input
                id="managed-suffix"
                autoComplete="off"
                {...register("suffix")}
              />
              <FieldError error={errors.suffix} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="managed-phone">Phone number</Label>
              <Input
                id="managed-phone"
                type="tel"
                autoComplete="off"
                {...register("phone_number")}
              />
              <FieldError error={errors.phone_number} />
            </div>
            {mode === "create" ? (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="managed-password">Temporary password</Label>
                <div className="relative">
                  <Input
                    id="managed-password"
                    type={showPassword ? "text" : "password"}
                    className="pr-11"
                    autoComplete="new-password"
                    {...register("temporary_password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={
                      showPassword
                        ? "Hide temporary password"
                        : "Show temporary password"
                    }
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                <FieldError error={errors.temporary_password} />
              </div>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="user-provisioning-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoaderCircle className="animate-spin" />
            ) : mode === "invite" ? (
              <MailPlus />
            ) : (
              <UserPlus />
            )}
            {isSubmitting
              ? "Submitting…"
              : mode === "invite"
                ? "Send invitation"
                : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
