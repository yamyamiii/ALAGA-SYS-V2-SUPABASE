import {
  getSupabaseClient,
  SupabaseConfigurationError,
} from "@/lib/supabase/client";

const FALLBACK_MESSAGE =
  "Your resident registration could not be submitted. Please try again.";

export class ResidentRegistrationServiceError extends Error {
  constructor(code, message = FALLBACK_MESSAGE, options = {}) {
    super(message, { cause: options.cause });
    this.name = "ResidentRegistrationServiceError";
    this.code = code;
  }
}

function mapRegistrationError(error) {
  if (error instanceof SupabaseConfigurationError) {
    return new ResidentRegistrationServiceError(
      "configuration_error",
      "Resident registration is not configured for this environment.",
      { cause: error },
    );
  }
  if (/signup.*disabled|signups not allowed/i.test(error?.message ?? "")) {
    return new ResidentRegistrationServiceError(
      "registration_unavailable",
      "Resident account creation is currently disabled. Contact the Barangay Health Center.",
      { cause: error },
    );
  }
  if (error?.code === "over_email_send_rate_limit") {
    return new ResidentRegistrationServiceError(
      "email_send_rate_limited",
      "Email sending is temporarily limited. Please wait a few minutes and try again. Your registration information was not lost if the account was already created.",
      { cause: error },
    );
  }
  if (error?.code === "over_request_rate_limit") {
    return new ResidentRegistrationServiceError(
      "request_rate_limited",
      "Too many requests were made in a short period. Please wait a few minutes and try again.",
      { cause: error },
    );
  }
  if (
    /database error (?:saving|creating) new user|failed.*(?:signup|user).*(?:hook|trigger)|registration capture/i.test(
      error?.message ?? "",
    )
  ) {
    return new ResidentRegistrationServiceError(
      "registration_capture_failed",
      "Your account and Resident registration could not be created safely. Please try again or contact the Barangay Health Center.",
      { cause: error },
    );
  }
  if (error?.status === 429 || /rate limit/i.test(error?.message ?? "")) {
    return new ResidentRegistrationServiceError(
      "request_rate_limited",
      "Too many requests were made in a short period. Please wait a few minutes and try again.",
      { cause: error },
    );
  }
  if (
    error?.code === "user_already_exists" ||
    /user already registered|already been registered/i.test(
      error?.message ?? "",
    )
  ) {
    return new ResidentRegistrationServiceError(
      "account_may_exist",
      "A new registration could not be started. If you previously registered, use Sign in and resend the confirmation email instead of submitting another registration.",
      { cause: error },
    );
  }
  if (/password/i.test(error?.message ?? "")) {
    return new ResidentRegistrationServiceError(
      "password_rejected",
      "Choose a stronger password and try again.",
      { cause: error },
    );
  }
  return new ResidentRegistrationServiceError(
    "registration_failed",
    FALLBACK_MESSAGE,
    {
      cause: error,
    },
  );
}

export function createResidentRegistrationService(
  clientProvider = getSupabaseClient,
) {
  let registrationRequest = null;

  function client() {
    try {
      return clientProvider();
    } catch (error) {
      throw mapRegistrationError(error);
    }
  }

  return {
    async listPuroks() {
      const { data, error } = await client().rpc(
        "resident_registration_localities",
      );
      if (error) {
        throw new ResidentRegistrationServiceError(
          "locality_unavailable",
          "Brgy. Bagongpook registration localities could not be loaded.",
          { cause: error },
        );
      }
      if (!Array.isArray(data) || data.length !== 7) {
        throw new ResidentRegistrationServiceError(
          "locality_invalid",
          "Resident registration requires exactly Purok 1 through Purok 7.",
        );
      }
      return data.map((row) => ({
        id: row.purok_id,
        name: row.purok_name,
      }));
    },

    register(values) {
      if (registrationRequest) return registrationRequest;

      registrationRequest = (async () => {
        try {
          const supabase = client();
          const { data, error } = await supabase.auth.signUp({
            email: values.email,
            password: values.password,
            options: {
              data: {
                registration_kind: "resident_self_registration",
                first_name: values.first_name,
                middle_name: values.middle_name || null,
                last_name: values.last_name,
                date_of_birth: values.date_of_birth,
                sex: values.sex,
                purok_id: values.purok_id,
                address_line: values.address_line || null,
                phone_number: values.phone_number || null,
              },
            },
          });

          // Supabase Auth inserts the Auth user and runs the database signup
          // triggers in one transaction. A successful user with a null session
          // means email confirmation is required. A mail-rate error can be
          // returned after account work has started, so the UI directs the user
          // to confirmation resend instead of encouraging another signup.
          if (error || !data?.user) throw mapRegistrationError(error);

          // Pending accounts are deliberately not kept signed in. They can sign
          // in after approval, while confirmation deployments remain compatible.
          if (data.session) {
            await supabase.auth
              .signOut({ scope: "local" })
              .catch(() => undefined);
          }

          return Object.freeze({
            status: "pending",
            emailConfirmationRequired: !data.session,
          });
        } finally {
          registrationRequest = null;
        }
      })();

      return registrationRequest;
    },
  };
}

export const residentRegistrationService = createResidentRegistrationService();
