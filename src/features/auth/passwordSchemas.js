import { z } from "zod";

export const passwordPolicySchema = z
  .string()
  .min(8, "Password must contain at least 8 characters.")
  .max(128, "Password is too long.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const resetPasswordSchema = z
  .object({
    new_password: passwordPolicySchema,
    confirm_password: z.string().min(1, "Confirm your new password."),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });

export const changePasswordSchema = resetPasswordSchema
  .and(
    z.object({
      current_password: z.string().min(1, "Current password is required."),
    }),
  )
  .refine((values) => values.current_password !== values.new_password, {
    path: ["new_password"],
    message: "New password must be different from your current password.",
  });

export const resetPasswordDefaults = Object.freeze({
  new_password: "",
  confirm_password: "",
});

export const changePasswordDefaults = Object.freeze({
  current_password: "",
  ...resetPasswordDefaults,
});
