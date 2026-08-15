import fs from "node:fs";

import { describe, expect, it } from "vitest";

const resetPath = "scripts/reset-appointment-test-data.sql";
const clinicalPath =
  "scripts/reset-appointment-linked-clinical-test-data-OPTIONAL.sql";
const reset = fs.readFileSync(resetPath, "utf8");
const clinical = fs.readFileSync(clinicalPath, "utf8");

describe("manual appointment test-data reset safety", () => {
  it("is a guarded manual script and not a deployment migration", () => {
    expect(resetPath).not.toContain("supabase/migrations");
    expect(reset).toContain(
      "DEVELOPMENT/TEST RESET ONLY — DO NOT RUN ON A PRODUCTION DATABASE WITH REAL PATIENT DATA.",
    );
    expect(reset).toMatch(
      /^-- set local alaga\.appointment_test_reset_confirmation/m,
    );
    expect(reset).toMatch(
      /appointment reset refused: review the target test project/i,
    );
    expect(reset.indexOf("$guard$;")).toBeLessThan(
      reset.indexOf("delete from public.notification_delivery_attempts"),
    );
  });

  it("fails closed for known and newly discovered appointment foreign keys", () => {
    for (const relationship of [
      ["public.appointments", "rescheduled_from_id"],
      ["public.appointment_request_events", "appointment_id"],
      ["public.health_encounters", "appointment_id"],
      ["public.maternal_prenatal_visits", "appointment_id"],
      ["public.maternal_postnatal_visits", "appointment_id"],
      ["public.child_growth_measurements", "appointment_id"],
      ["public.child_health_visits", "appointment_id"],
    ]) {
      expect(reset).toContain(`('${relationship[0]}', '${relationship[1]}')`);
    }
    expect(reset).toMatch(/review newly discovered appointment FKs/i);
  });

  it("reports and blocks every direct clinical appointment dependency", () => {
    for (const relation of [
      "health_encounters",
      "maternal_prenatal_visits",
      "maternal_postnatal_visits",
      "child_growth_measurements",
      "child_health_visits",
    ]) {
      expect(reset).toContain(`public.${relation}`);
    }
    expect(reset).toMatch(/linked clinical records require review/i);
    expect(reset.indexOf("$clinical_guard$;")).toBeLessThan(
      reset.indexOf("delete from public.notification_delivery_attempts"),
    );
    expect(reset).not.toMatch(/delete from public\.health_encounters/i);
  });

  it("removes only trusted appointment artifacts in dependency order", () => {
    const orderedDeletes = [
      "delete from public.notification_delivery_attempts",
      "delete from public.outbound_notification_jobs",
      "delete from public.assistance_notifications",
      "delete from public.appointment_request_events",
      "delete from public.audit_logs",
      "delete from public.appointments",
    ];
    let previous = -1;
    for (const statement of orderedDeletes) {
      const position = reset.indexOf(statement);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    expect(reset).toMatch(
      /notification\.source_type = 'appointments'[\s\S]*notification\.source_id = target\.id/i,
    );
    expect(reset).toMatch(
      /job\.source_type = 'appointments'[\s\S]*target\.id = job\.source_id/i,
    );
    expect(reset).toMatch(
      /audit\.entity_type = 'appointments'[\s\S]*audit\.entity_id = target\.id/i,
    );
  });

  it("preserves resident, identity, announcement, role, and configuration data", () => {
    for (const relation of [
      "residents",
      "profiles",
      "announcements",
      "roles",
      "barangays",
      "puroks",
      "households",
      "health_center_information",
    ]) {
      expect(reset).not.toMatch(
        new RegExp(`delete\\s+from\\s+(?:public\\.)?${relation}\\b`, "i"),
      );
    }
    expect(reset).not.toMatch(/delete\s+from\s+auth\./i);
  });

  it("restores trigger protections and keeps number restart opt-in", () => {
    expect(reset).toMatch(
      /disable trigger audit_logs_append_only[\s\S]*enable trigger audit_logs_append_only/i,
    );
    expect(reset).toMatch(/disable trigger user[\s\S]*enable trigger user/i);
    expect(reset).toMatch(
      /^-- select pg_catalog\.setval\('public\.appointment_number_seq', 1, false\);/m,
    );
    expect(reset).toMatch(
      /if any appointment or retained appointment artifact/i,
    );
  });

  it("keeps destructive clinical cleanup in a separately guarded optional script", () => {
    expect(clinicalPath).not.toContain("supabase/migrations");
    expect(clinical).toContain(
      "OPTIONAL COMPANION — NOT PART OF THE APPOINTMENT RESET",
    );
    expect(clinical).toMatch(
      /^-- set local alaga\.clinical_test_reset_confirmation/m,
    );
    expect(clinical).toMatch(/review every previewed record/i);
    expect(clinical.indexOf("$clinical_guard$;")).toBeLessThan(
      clinical.indexOf("delete from public.notification_delivery_attempts"),
    );
    expect(clinical).toMatch(/Remove encounter amendment chains leaf-first/i);
  });
});
