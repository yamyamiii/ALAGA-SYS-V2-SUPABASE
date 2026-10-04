import fs from "node:fs";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720010700_resident_health_history.sql",
  "utf8",
);
const router = fs.readFileSync("src/app/router.jsx", "utf8");
const service = fs.readFileSync(
  "src/services/residentHealthHistoryService.js",
  "utf8",
);
const page = fs.readFileSync(
  "src/features/resident-health-history/MyHealthHistoryPage.jsx",
  "utf8",
);
const functions = [
  ...migration.matchAll(
    /create or replace function public\.([a-z_]+)\([\s\S]*?\n\$\$;/g,
  ),
];
const detail = functions.find((m) => m[1] === "resident_health_history_get")[0];
describe("Resident finalized-history safety contract", () => {
  it("derives active non-retired linked identity, not browser authority", () => {
    expect(migration).toContain("profile.id = auth.uid()");
    expect(migration).toContain("profile.retired_at is null");
    expect(migration).toContain("resident.linked_profile_id = profile.id");
    expect(migration).not.toMatch(/p_resident_id|p_profile_id/i);
    expect(service).not.toMatch(/p_resident_id|p_profile_id|\.from\(/);
  });
  it("uses a single signed/amended signature-and-archive predicate", () => {
    expect(migration).toMatch(/p_status in \('signed', 'amended'\)/);
    expect(migration).toMatch(
      /p_signed_at is not null and p_signed_by is not null/,
    );
    expect(migration).toContain("p_archived_at is null");
    expect(detail).toContain("encounter.resident_id = v_resident_id");
    expect(detail).toContain("public.resident_health_history_finalized(");
  });
  it("exposes only the approved summary and raw measured values", () => {
    expect(detail).toMatch(
      /'assessment', nullif\(btrim\(encounter\.assessment\)/,
    );
    expect(detail).toContain("'temperature_c', vitals.temperature_c");
    expect(detail).not.toMatch(
      /subjective_notes|objective_notes|diagnosis_text|treatment_notes|amendment_reason|recorded_by|version|created_at|bmi|to_jsonb\(encounter\)/i,
    );
    expect(page).not.toMatch(
      /dangerouslySetInnerHTML|console\.|localStorage|sessionStorage/,
    );
  });
  it("closes raw Resident clinical reads without weakening staff policies or granting writes", () => {
    expect(migration).toContain(
      "drop policy health_encounters_select_resident_signed on public.health_encounters",
    );
    expect(migration).not.toMatch(
      /drop policy health_encounters_select_(?:nurse|midwife)/,
    );
    expect(migration).not.toMatch(
      /grant (?:select|insert|update|delete|all) on (?:table|public)/i,
    );
    expect(migration).not.toMatch(
      /(?:delete from|update|insert into) public\.(?:health_encounters|vital_signs|profiles|residents|appointments)/i,
    );
    for (const fn of functions.filter((m) => /security definer/.test(m[0])))
      expect(fn[0]).toContain("set search_path = ''");
  });
  it("keeps helper execution private and RPC reads limited to authenticated callers", () => {
    expect(migration).toMatch(
      /revoke all on function public\.resident_health_history_identity\(\)[\s\S]*from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.resident_health_history_list\(integer, integer\),[\s\S]*to authenticated/,
    );
    expect(migration).not.toMatch(/grant[^;]*to (?:public|anon)/);
  });
  it("sends only a private content-free cache signal without publishing clinical tables", () => {
    const trigger = functions.find(
      (m) => m[1] === "emit_resident_health_history_sync",
    )[0];
    expect(trigger).toContain(
      "emit_realtime_sync_event('health_history', null, v_recipient, null)",
    );
    expect(trigger).not.toMatch(
      /assessment|diagnosis|treatment|subjective|objective|vital|plan/,
    );
    expect(migration).not.toMatch(/alter publication|replica identity/i);
  });
  it("keeps Residents out of staff documentation routes and staff out of personal history", () => {
    expect(router).toMatch(
      /ROUTES\.myHealthHistory[\s\S]*RoleGuard roles=\{\[USER_ROLES.RESIDENT\]\}/,
    );
    expect(router).toContain("<StaffHealthRecordRoute>");
    expect(router).toContain("to={ROUTES.myHealthHistory}");
    expect(page).not.toMatch(
      /EncounterCreateDialog|VitalSignsDialog|EncounterActionDialog|\.mutateAsync|DocumentPreviewDialog/,
    );
  });
});
