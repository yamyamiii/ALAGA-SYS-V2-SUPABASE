const LIMITS = Object.freeze({
  receiving_facility: 500,
  reason_for_referral: 2_000,
  clinical_summary: 5_000,
});

export const EMPTY_REFERRAL = Object.freeze({
  receiving_facility: "",
  reason_for_referral: "",
  clinical_summary: "",
});

export function validateReferral(values) {
  const data = Object.fromEntries(
    Object.keys(EMPTY_REFERRAL).map((key) => [key, values[key]?.trim() ?? ""]),
  );
  const errors = {};
  for (const [key, maximum] of Object.entries(LIMITS)) {
    if (data[key].length < 2) errors[key] = "Enter at least 2 characters.";
    else if (data[key].length > maximum) {
      errors[key] = `Use ${maximum.toLocaleString()} characters or fewer.`;
    }
  }
  return Object.keys(errors).length ? { errors } : { data, errors: {} };
}
