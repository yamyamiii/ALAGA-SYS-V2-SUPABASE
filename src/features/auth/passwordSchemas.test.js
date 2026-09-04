import { describe, expect, it } from "vitest";

import {
  changePasswordSchema,
  resetPasswordSchema,
} from "@/features/auth/passwordSchemas";

describe("shared account password policy", () => {
  it("accepts matching passwords that satisfy the existing policy", () => {
    expect(
      resetPasswordSchema.parse({
        new_password: "NewPassword123",
        confirm_password: "NewPassword123",
      }),
    ).toMatchObject({ new_password: "NewPassword123" });
  });

  it("rejects weak and mismatched recovery passwords", () => {
    expect(() =>
      resetPasswordSchema.parse({
        new_password: "password",
        confirm_password: "password",
      }),
    ).toThrow();
    expect(() =>
      resetPasswordSchema.parse({
        new_password: "NewPassword123",
        confirm_password: "Different123",
      }),
    ).toThrow();
  });

  it("requires the current password for authenticated password changes", () => {
    expect(() =>
      changePasswordSchema.parse({
        current_password: "",
        new_password: "NewPassword123",
        confirm_password: "NewPassword123",
      }),
    ).toThrow();
  });
});
