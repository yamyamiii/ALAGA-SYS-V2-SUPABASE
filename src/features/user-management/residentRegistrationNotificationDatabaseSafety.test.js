import fs from "node:fs";

import { describe, expect, it } from "vitest";

const typeMigration = fs.readFileSync(
  "supabase/migrations/20260720005400_resident_registration_notification_type.sql",
  "utf8",
);
const notificationMigration = fs.readFileSync(
  "supabase/migrations/20260720005500_notify_pending_resident_registration.sql",
  "utf8",
);

describe("pending Resident registration notification boundary", () => {
  it("commits the new symbolic enum type before a later migration uses it", () => {
    expect(typeMigration).toMatch(
      /alter type public\.assistance_notification_type[\s\S]*add value if not exists 'resident_registration_pending'/i,
    );
    expect(typeMigration).not.toMatch(
      /assistance_notifications|create trigger/i,
    );
    expect(notificationMigration).toMatch(
      /'resident_registration_pending'::public\.assistance_notification_type/i,
    );
  });

  it("requires both pending status and confirmed email before notifying", () => {
    expect(notificationMigration).toMatch(
      /registration\.status = 'pending'::public\.resident_registration_status/i,
    );
    expect(notificationMigration).toMatch(
      /auth_user\.email_confirmed_at is not null/i,
    );
    expect(notificationMigration).toMatch(
      /applicant\.role = 'resident'::public\.app_role[\s\S]*applicant\.account_status = 'invited'::public\.account_status/i,
    );
  });

  it("notifies every active Administrator and no other role", () => {
    expect(notificationMigration).toMatch(
      /from public\.profiles as administrator[\s\S]*administrator\.role = 'admin'::public\.app_role[\s\S]*administrator\.account_status = 'active'::public\.account_status/i,
    );
    expect(notificationMigration).not.toMatch(
      /administrator\.role\s+in\s*\(|'barangay_health_worker'::public\.app_role|'nurse'::public\.app_role|'midwife'::public\.app_role/i,
    );
  });

  it("uses trusted source metadata and the fixed User Management destination", () => {
    expect(notificationMigration).toMatch(
      /'resident_registration',[\s\S]*p_registration_id,[\s\S]*'\/user-management'/i,
    );
    expect(notificationMigration).not.toMatch(
      /p_(?:recipient|title|summary|action_path|source_type)/i,
    );
  });

  it("creates at most one row per Administrator and registration", () => {
    expect(notificationMigration).toMatch(
      /'resident-registration:' \|\| p_registration_id::text \|\| ':pending-review'/i,
    );
    expect(notificationMigration).toMatch(
      /on conflict \(recipient_profile_id, dedup_key\) do nothing/i,
    );
  });

  it("covers auto-confirmed inserts, later confirmations, and existing actionable rows", () => {
    expect(notificationMigration).toMatch(
      /after insert on public\.resident_registration_requests/i,
    );
    expect(notificationMigration).toMatch(
      /after update of email_confirmed_at on auth\.users/i,
    );
    expect(notificationMigration).toMatch(
      /old\.email_confirmed_at is null and new\.email_confirmed_at is not null/i,
    );
    expect(notificationMigration).toMatch(
      /backfill only registrations that are already actionable[\s\S]*request\.status = 'pending'[\s\S]*auth_user\.email_confirmed_at is not null/i,
    );
  });

  it("keeps content privacy-minimized", () => {
    expect(notificationMigration).toContain("New Resident registration");
    expect(notificationMigration).toContain(
      "A new Resident registration is awaiting review.",
    );
    expect(notificationMigration).not.toMatch(
      /registration\.(?:first_name|middle_name|last_name|date_of_birth|phone_number|address_line)/i,
    );
  });

  it("exposes neither notification creation nor trigger functions to browsers", () => {
    for (const functionName of [
      "resident_registration_notify_administrators",
      "resident_registration_notify_after_insert",
      "resident_registration_notify_after_confirmation",
    ]) {
      expect(notificationMigration).toMatch(
        new RegExp(
          `revoke all on function public\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
    }
    expect(notificationMigration).not.toMatch(
      /grant\s+(?:insert|update|delete|all)\s+on\s+(?:table\s+)?public\.assistance_notifications/i,
    );
  });
});
