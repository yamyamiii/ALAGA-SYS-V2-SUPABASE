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
});
