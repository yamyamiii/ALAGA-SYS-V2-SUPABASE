import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720003000_ai_grounding_context.sql",
  "utf8",
);

const functionBody = migration.slice(
  migration.indexOf("create or replace function"),
  migration.indexOf("revoke all on function"),
);
const defenseReadinessMigration = fs.readFileSync(
  "supabase/migrations/20260720005800_ai_defense_readiness.sql",
  "utf8",
);
const currentFunctionBody = defenseReadinessMigration.slice(
  defenseReadinessMigration.indexOf(
    "create or replace function public.ai_grounding_context",
  ),
  defenseReadinessMigration.indexOf(
    "revoke all on function public.ai_grounding_context",
  ),
);
const announcementSchedulingMigration = fs.readFileSync(
  "supabase/migrations/20260720005900_show_scheduled_announcements_to_managers.sql",
  "utf8",
);
const latestFunctionBody = announcementSchedulingMigration.slice(
  announcementSchedulingMigration.indexOf(
    "create or replace function public.ai_grounding_context",
  ),
  announcementSchedulingMigration.indexOf(
    "revoke all on function public.ai_grounding_context",
  ),
);
const conversationalAnnouncementMigration = fs.readFileSync(
  "supabase/migrations/20260720006000_conversational_ai_announcement_grounding.sql",
  "utf8",
);
const conversationalFunctionBody = conversationalAnnouncementMigration.slice(
  conversationalAnnouncementMigration.indexOf(
    "create or replace function public.ai_grounding_context",
  ),
  conversationalAnnouncementMigration.indexOf(
    "revoke all on function public.ai_grounding_context",
  ),
);

describe("ALAGA AI approved grounding database boundary", () => {
  it("returns only explicitly approved source fields", () => {
    expect(migration).toMatch(
      /returns table \([\s\S]*source_type text[\s\S]*source_label text[\s\S]*title text[\s\S]*content text[\s\S]*updated_at timestamptz/i,
    );
    expect(functionBody).toMatch(/from public\.faq_entries as faq/i);
    expect(functionBody).toMatch(
      /from public\.health_center_information as info/i,
    );
    expect(functionBody).toMatch(/from public\.announcements as announcement/i);
    expect(functionBody).not.toMatch(
      /from public\.(?:residents|households|appointments|health_encounters|vital_signs|maternal_|child_|audit_logs|resident_inquiries)/i,
    );
    expect(functionBody).not.toMatch(
      /created_by|updated_by|resident_name|contact_number|email|emergency_contacts|doctors|nurses|midwives|bhws/i,
    );
  });

  it("excludes archived FAQs and inactive announcements", () => {
    expect(functionBody).toMatch(/faq\.archived_at is null/i);
    expect(functionBody).toMatch(/announcement\.archived_at is null/i);
    expect(functionBody).toMatch(
      /announcement\.publish_at <= pg_catalog\.statement_timestamp\(\)/i,
    );
    expect(functionBody).toMatch(
      /announcement\.expires_at is null[\s\S]*announcement\.expires_at > pg_catalog\.statement_timestamp\(\)/i,
    );
  });

  it("bounds requested source types, rows, and content", () => {
    expect(functionBody).toMatch(
      /cardinality\(p_source_types\) not between 1 and 3/i,
    );
    expect(functionBody).toMatch(/p_per_source_limit not between 1 and 8/i);
    expect(functionBody).toMatch(
      /requested\.source_type not in \([\s\S]*'faq'[\s\S]*'health_center'[\s\S]*'announcement'/i,
    );
    expect(functionBody).toMatch(
      /where grounding\.source_rank <= p_per_source_limit/i,
    );
    expect(functionBody).toMatch(/left\(btrim\(faq\.answer\), 2000\)/i);
    expect(functionBody).toMatch(
      /left\(btrim\(announcement\.content\), 1600\)/i,
    );
  });

  it("requires an active supported profile", () => {
    expect(functionBody).toMatch(/profile\.account_status = 'active'/i);
    expect(functionBody).toMatch(
      /actor_role not in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'[\s\S]*'nurse'[\s\S]*'midwife'[\s\S]*'resident'/i,
    );
    expect(functionBody).toMatch(/using errcode = '42501'/i);
  });

  it("is read-only and callable only by service_role", () => {
    expect(migration).toMatch(
      /language plpgsql[\s\S]*stable[\s\S]*security definer/i,
    );
    expect(functionBody).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from|execute\s+format|nextval)\b/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*to service_role/i,
    );
    expect(migration).not.toMatch(/to authenticated/i);
  });

  it("adds only approved public contact fields in the current replacement", () => {
    expect(currentFunctionBody).toMatch(/info\.contact_number/i);
    expect(currentFunctionBody).toMatch(/info\.email/i);
    expect(currentFunctionBody).toMatch(/info\.emergency_contacts/i);
    expect(currentFunctionBody).not.toMatch(
      /info\.(?:doctors|nurses|midwives|bhws)/i,
    );
    expect(defenseReadinessMigration).toMatch(
      /revoke all on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(defenseReadinessMigration).toMatch(
      /grant execute on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*to service_role/i,
    );
  });

  it("adds only safe structured event fields to active announcement grounding", () => {
    expect(latestFunctionBody).toMatch(
      /category text[\s\S]*event_start_at timestamptz[\s\S]*event_end_at timestamptz/i,
    );
    expect(latestFunctionBody).toMatch(
      /announcement\.archived_at is null[\s\S]*announcement\.publish_at <= pg_catalog\.statement_timestamp\(\)[\s\S]*announcement\.expires_at > pg_catalog\.statement_timestamp\(\)/i,
    );
    expect(latestFunctionBody).toMatch(
      /announcement\.category::text[\s\S]*announcement\.event_start_at[\s\S]*announcement\.event_end_at/i,
    );
    const returnShape = latestFunctionBody.slice(
      latestFunctionBody.indexOf("returns table"),
      latestFunctionBody.indexOf("language plpgsql"),
    );
    expect(returnShape).not.toMatch(/\b(?:id|created_by|updated_by)\b/i);
    expect(announcementSchedulingMigration).toMatch(
      /revoke all on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(announcementSchedulingMigration).toMatch(
      /grant execute on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*to service_role/i,
    );
  });

  it("adds safe publication semantics without exposing announcement internals", () => {
    expect(conversationalFunctionBody).toMatch(
      /returns table \([\s\S]*category text[\s\S]*publish_at timestamptz[\s\S]*event_start_at timestamptz[\s\S]*event_end_at timestamptz[\s\S]*expires_at timestamptz[\s\S]*updated_at timestamptz/i,
    );
    expect(conversationalFunctionBody).toMatch(
      /announcement\.archived_at is null[\s\S]*announcement\.publish_at <= pg_catalog\.statement_timestamp\(\)[\s\S]*announcement\.expires_at > pg_catalog\.statement_timestamp\(\)/i,
    );
    expect(conversationalFunctionBody).toMatch(
      /row_number\(\) over \(\s*order by announcement\.publish_at desc, announcement\.id\s*\)/i,
    );
    expect(conversationalFunctionBody).not.toMatch(
      /announcement\.is_pinned[\s\S]*announcement\.publish_at desc/i,
    );
    expect(conversationalFunctionBody).toMatch(
      /order by grounding\.source_order, grounding\.source_rank/i,
    );
    const returnShape = conversationalFunctionBody.slice(
      conversationalFunctionBody.indexOf("returns table"),
      conversationalFunctionBody.indexOf("language plpgsql"),
    );
    expect(returnShape).not.toMatch(
      /\b(?:id|created_by|updated_by|request_key|notification_id)\b/i,
    );
  });

  it("keeps conversational grounding active-profile-bound and service-role-only", () => {
    expect(conversationalFunctionBody).toMatch(
      /profile\.account_status = 'active'::public\.account_status/i,
    );
    expect(conversationalFunctionBody).toMatch(
      /actor_role not in \([\s\S]*'admin'[\s\S]*'barangay_health_worker'[\s\S]*'nurse'[\s\S]*'midwife'[\s\S]*'resident'/i,
    );
    expect(conversationalAnnouncementMigration).toMatch(
      /revoke all on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(conversationalAnnouncementMigration).toMatch(
      /grant execute on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*to service_role/i,
    );
    expect(conversationalAnnouncementMigration).not.toMatch(
      /grant execute[^;]*to (?:anon|authenticated)/i,
    );
    expect(conversationalFunctionBody).not.toMatch(
      /from public\.(?:residents|appointments|health_encounters|vital_signs|maternal_|child_|audit_logs|resident_inquiries)/i,
    );
  });
});
