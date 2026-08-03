import { describe, expect, it } from "vitest";

import { validateReferral } from "@/features/documents/referralSchema";

describe("referral form validation", () => {
  it("accepts bounded clinician-authored content", () => {
    expect(
      validateReferral({
        receiving_facility: " Lipa City Hospital ",
        reason_for_referral: " Further evaluation ",
        clinical_summary: " Concise clinician-approved summary ",
      }),
    ).toEqual({
      data: {
        receiving_facility: "Lipa City Hospital",
        reason_for_referral: "Further evaluation",
        clinical_summary: "Concise clinician-approved summary",
      },
      errors: {},
    });
  });

  it("rejects missing and unbounded content before the RPC", () => {
    const result = validateReferral({
      receiving_facility: "",
      reason_for_referral: "x",
      clinical_summary: "x".repeat(5_001),
    });
    expect(result.data).toBeUndefined();
    expect(result.errors).toEqual({
      receiving_facility: "Enter at least 2 characters.",
      reason_for_referral: "Enter at least 2 characters.",
      clinical_summary: "Use 5,000 characters or fewer.",
    });
  });
});
