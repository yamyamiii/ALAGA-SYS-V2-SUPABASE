import { describe, expect, it, vi } from "vitest";

import { createResidentRegistrationService } from "@/services/residentRegistrationService";

const values = {
  email: "resident@example.com",
  password: "Secure123",
  confirm_password: "Secure123",
  first_name: "Ana",
  middle_name: "",
  last_name: "Reyes",
  date_of_birth: "1995-04-10",
  sex: "female",
  purok_id: "20000000-0000-4000-8000-000000000001",
  address_line: "",
  phone_number: "",
};

describe("Resident registration service", () => {
  it("loads exactly the safe public Bagongpook purok references", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: Array.from({ length: 7 }, (_, index) => ({
        purok_id: `20000000-0000-4000-8000-00000000000${index + 1}`,
        purok_name: `Purok ${index + 1}`,
      })),
      error: null,
    });
    const service = createResidentRegistrationService(() => ({ rpc }));

    await expect(service.listPuroks()).resolves.toHaveLength(7);
    expect(rpc).toHaveBeenCalledWith("resident_registration_localities");
  });

  it("submits Resident data without role, status, resident ID, or household metadata", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { id: "profile-id" }, session: null },
      error: null,
    });
    const service = createResidentRegistrationService(() => ({
      auth: { signUp, signOut: vi.fn() },
    }));

    await expect(service.register(values)).resolves.toEqual({
      status: "pending",
      emailConfirmationRequired: true,
    });
    const payload = signUp.mock.calls[0][0];
    expect(payload.options.data).toMatchObject({
      registration_kind: "resident_self_registration",
      first_name: "Ana",
      purok_id: values.purok_id,
    });
    expect(payload.options.data).not.toHaveProperty("role");
    expect(payload.options.data).not.toHaveProperty("account_status");
    expect(payload.options.data).not.toHaveProperty("resident_id");
    expect(payload.options.data).not.toHaveProperty("household_id");
    expect(payload.options.data).not.toHaveProperty("confirm_password");
  });

  it("treats a created user with no session as email-confirmation success", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: {
        user: { id: "email-confirmation-profile" },
        session: null,
      },
      error: null,
    });
    const service = createResidentRegistrationService(() => ({
      auth: { signUp, signOut: vi.fn() },
    }));

    await expect(service.register(values)).resolves.toEqual({
      status: "pending",
      emailConfirmationRequired: true,
    });
  });

  it("coalesces simultaneous registration calls into one signUp request", async () => {
    let resolveSignup;
    const signUp = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSignup = resolve;
        }),
    );
    const service = createResidentRegistrationService(() => ({
      auth: { signUp, signOut: vi.fn() },
    }));

    const first = service.register(values);
    const second = service.register(values);
    expect(signUp).toHaveBeenCalledOnce();
    expect(second).toBe(first);

    resolveSignup({
      data: { user: { id: "profile-id" }, session: null },
      error: null,
    });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(signUp).toHaveBeenCalledOnce();
  });

  it("maps over_email_send_rate_limit without denying possible partial success", async () => {
    const service = createResidentRegistrationService(() => ({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "possibly-created" }, session: null },
          error: {
            code: "over_email_send_rate_limit",
            status: 429,
            message: "email rate limit exceeded",
          },
        }),
      },
    }));

    await expect(service.register(values)).rejects.toMatchObject({
      code: "email_send_rate_limited",
      message:
        "Email sending is temporarily limited. Please wait a few minutes and try again. Your registration information was not lost if the account was already created.",
    });
  });

  it("maps over_request_rate_limit separately from registration validation", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: {
        code: "over_request_rate_limit",
        status: 429,
        message: "request rate limit exceeded",
      },
    });
    const service = createResidentRegistrationService(() => ({
      auth: { signUp },
    }));

    await expect(service.register(values)).rejects.toMatchObject({
      code: "request_rate_limited",
      message:
        "Too many requests were made in a short period. Please wait a few minutes and try again.",
    });
    expect(signUp).toHaveBeenCalledOnce();
  });

  it("ends an immediate Auth session while leaving the account pending", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const service = createResidentRegistrationService(() => ({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "profile-id" }, session: { access_token: "x" } },
          error: null,
        }),
        signOut,
      },
    }));

    await expect(service.register(values)).resolves.toMatchObject({
      status: "pending",
      emailConfirmationRequired: false,
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("fails closed when the deployment does not return exactly seven puroks", async () => {
    const service = createResidentRegistrationService(() => ({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    }));
    await expect(service.listPuroks()).rejects.toMatchObject({
      code: "locality_invalid",
    });
  });

  it("handles a possible existing account without encouraging another signup", async () => {
    const service = createResidentRegistrationService(() => ({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: {
            code: "user_already_exists",
            message: "User already registered",
            status: 422,
          },
        }),
      },
    }));
    await expect(service.register(values)).rejects.toMatchObject({
      code: "account_may_exist",
      message:
        "A new registration could not be started. If you previously registered, use Sign in and resend the confirmation email instead of submitting another registration.",
    });
  });

  it("distinguishes disabled signup from a successful null-session signup", async () => {
    const service = createResidentRegistrationService(() => ({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: "Signups not allowed for this instance" },
        }),
      },
    }));

    await expect(service.register(values)).rejects.toMatchObject({
      code: "registration_unavailable",
      message:
        "Resident account creation is currently disabled. Contact the Barangay Health Center.",
    });
  });

  it("reports a genuine database registration-capture failure separately", async () => {
    const service = createResidentRegistrationService(() => ({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: "Database error saving new user" },
        }),
      },
    }));

    await expect(service.register(values)).rejects.toMatchObject({
      code: "registration_capture_failed",
      message:
        "Your account and Resident registration could not be created safely. Please try again or contact the Barangay Health Center.",
    });
  });
});
