import { describe, expect, it } from "vitest";

import { residentRegistrationSchema } from "@/features/auth/residentRegistrationSchema";

const validRegistration = {
  email: "resident@example.com",
  password: "Secure123",
  confirm_password: "Secure123",
  first_name: " Ana ",
  middle_name: " Maria ",
  last_name: " Reyes ",
  date_of_birth: "1995-04-10",
  sex: "female",
  purok_id: "20000000-0000-4000-8000-000000000001",
  address_line: " 123 Main Street ",
  phone_number: "+63 912 345 6789",
};

describe("Resident self-registration schema", () => {
  it("accepts and normalizes the approved Resident-only fields", () => {
    expect(residentRegistrationSchema.parse(validRegistration)).toMatchObject({
      first_name: "Ana",
      middle_name: "Maria",
      last_name: "Reyes",
      address_line: "123 Main Street",
    });
  });

  it("allows optional middle name, address, and phone", () => {
    expect(
      residentRegistrationSchema.parse({
        ...validRegistration,
        middle_name: "",
        address_line: "",
        phone_number: "",
      }),
    ).toMatchObject({ middle_name: "", address_line: "", phone_number: "" });
  });

  it("rejects mismatched or weak passwords and future dates", () => {
    expect(() =>
      residentRegistrationSchema.parse({
        ...validRegistration,
        confirm_password: "Different123",
      }),
    ).toThrow();
    expect(() =>
      residentRegistrationSchema.parse({
        ...validRegistration,
        password: "password",
        confirm_password: "password",
      }),
    ).toThrow();
    expect(() =>
      residentRegistrationSchema.parse({
        ...validRegistration,
        date_of_birth: "2999-01-01",
      }),
    ).toThrow();
  });

  it("does not accept browser-supplied role, status, staff, or household fields", () => {
    const parsed = residentRegistrationSchema.parse({
      ...validRegistration,
      role: "admin",
      account_status: "active",
      staff_id: "20000000-0000-4000-8000-000000000002",
      household_id: "20000000-0000-4000-8000-000000000003",
    });
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("account_status");
    expect(parsed).not.toHaveProperty("staff_id");
    expect(parsed).not.toHaveProperty("household_id");
  });
});
