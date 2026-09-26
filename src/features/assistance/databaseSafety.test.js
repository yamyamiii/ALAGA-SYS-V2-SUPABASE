import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720002700_general_assistance.sql",
  "utf8",
);
const announcementNotificationCleanup = fs.readFileSync(
  "supabase/migrations/20260720004300_cleanup_archived_announcement_notifications.sql",
  "utf8",
);
const scheduledAnnouncementManagement = fs.readFileSync(
  "supabase/migrations/20260720005900_show_scheduled_announcements_to_managers.sql",
  "utf8",
);
const permanentAnnouncementDeletion = fs.readFileSync(
  "supabase/migrations/20260720010000_permanent_announcement_delete.sql",
  "utf8",
);

describe("general assistance database boundary", () => {
  it("uses RPC-only tables with RLS and no authenticated table writes", () => {
    for (const table of [
      "announcements",
      "assistance_notifications",
      "health_center_information",
      "faq_entries",
      "resident_inquiries",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `alter table public\\.${table} enable row level security`,
          "i",
        ),
      );
    }
    expect(migration).toMatch(
      /revoke all on table public\.announcements,[\s\S]*resident_inquiries from public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*public\.(?:announcements|assistance_notifications|health_center_information|faq_entries|resident_inquiries)[^;]*authenticated/i,
    );
  });

  it("shows residents only published, unexpired announcements in pinned order", () => {
    expect(migration).toMatch(/a\.publish_at <= now\(\)/i);
    expect(migration).toMatch(
      /a\.expires_at is null or a\.expires_at > now\(\)/i,
    );
    expect(migration).toMatch(
      /order by a\.is_pinned desc,\s*a\.publish_at desc,\s*a\.id/i,
    );
    expect(migration).toMatch(
      /archived announcements require announcement management access/i,
    );
  });

  it("gives only Admin/BHW the complete management read model", () => {
    expect(scheduledAnnouncementManagement).toMatch(
      /actor_role in \('admin', 'barangay_health_worker'\)[\s\S]*announcement\.archived_at is null[\s\S]*or p_include_archived/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /actor_role not in \('admin', 'barangay_health_worker'\)[\s\S]*announcement\.archived_at is null[\s\S]*announcement\.publish_at <= pg_catalog\.statement_timestamp\(\)[\s\S]*announcement\.expires_at is null[\s\S]*announcement\.expires_at > pg_catalog\.statement_timestamp\(\)/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /if p_include_archived[\s\S]*actor_role not in \('admin', 'barangay_health_worker'\)[\s\S]*errcode = '42501'/i,
    );
  });

  it("separates optional event timing from publication and expiration", () => {
    expect(scheduledAnnouncementManagement).toMatch(
      /add column event_start_at timestamptz[\s\S]*add column event_end_at timestamptz/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /constraint announcements_event_window_valid check[\s\S]*event_end_at is null[\s\S]*event_start_at is not null[\s\S]*event_end_at > event_start_at/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /p_expires_at is not null[\s\S]*p_expires_at <= effective_publish_at/i,
    );
    expect(scheduledAnnouncementManagement).not.toMatch(
      /event_start_at\s*(?:>=|>)\s*(?:publish_at|effective_publish_at)/i,
    );
  });

  it("uses a trusted Publish now boundary without resetting published rows", () => {
    expect(scheduledAnnouncementManagement).toMatch(
      /when p_publish_now then operation_time[\s\S]*else p_publish_at/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /when p_publish_now and current_record\.publish_at <= operation_time[\s\S]*then current_record\.publish_at[\s\S]*when p_publish_now then operation_time/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /array\[[\s\S]*'publish_at'[\s\S]*'event_start_at'[\s\S]*'event_end_at'[\s\S]*'expires_at'/i,
    );
  });

  it("keeps in-app notification availability synchronized to publish_at", () => {
    expect(migration).toMatch(
      /source_id,action_path,dedup_key,available_at[\s\S]*saved_record\.publish_at/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /update public\.assistance_notifications as notification[\s\S]*available_at = new\.publish_at[\s\S]*notification\.source_type = 'announcements'[\s\S]*notification\.source_id = new\.id/i,
    );
    expect(scheduledAnnouncementManagement).toMatch(
      /after update of title, publish_at[\s\S]*execute function public\.sync_announcement_notification_schedule\(\)/i,
    );
    expect(scheduledAnnouncementManagement).not.toMatch(
      /after update of[^\n;]*event_start_at/i,
    );
  });

  it("grounds AI with safe event fields and no announcement identifiers", () => {
    const groundingFunction = scheduledAnnouncementManagement.slice(
      scheduledAnnouncementManagement.indexOf(
        "create or replace function public.ai_grounding_context",
      ),
      scheduledAnnouncementManagement.indexOf(
        "revoke all on function public.ai_grounding_context",
      ),
    );
    expect(groundingFunction).toMatch(
      /category text[\s\S]*event_start_at timestamptz[\s\S]*event_end_at timestamptz/i,
    );
    expect(groundingFunction).toMatch(
      /announcement\.category::text[\s\S]*announcement\.event_start_at[\s\S]*announcement\.event_end_at/i,
    );
    expect(groundingFunction).toMatch(
      /announcement\.publish_at <= pg_catalog\.statement_timestamp\(\)[\s\S]*announcement\.expires_at > pg_catalog\.statement_timestamp\(\)/i,
    );
    const returnShape = groundingFunction.slice(
      groundingFunction.indexOf("returns table"),
      groundingFunction.indexOf("language plpgsql"),
    );
    expect(returnShape).not.toMatch(/\b(?:id|created_by|updated_by)\b/i);
    expect(groundingFunction).not.toMatch(
      /grounding\.(?:id|created_by|updated_by)/i,
    );
  });

  it("authorizes only Admin/BHW soft deletion with locking, versioning, and audit", () => {
    expect(migration).toMatch(
      /function public\.announcement_archive[\s\S]*assistance_require_role\(\s*array\['admin','barangay_health_worker'\][\s\S]*where id=p_id for update[\s\S]*current_record\.version<>p_expected_version[\s\S]*archived_at=statement_timestamp\(\)[\s\S]*updated_by=auth\.uid\(\)[\s\S]*'announcement\.archived'/i,
    );
    expect(migration).toMatch(
      /a\.archived_at is null and a\.publish_at <= now\(\)/i,
    );
    expect(migration).not.toMatch(/delete\s+from\s+public\.announcements/i);
  });

  it("removes only source-linked notification rows while retaining announcement history", () => {
    expect(announcementNotificationCleanup).toMatch(
      /delete from public\.assistance_notifications as notification[\s\S]*notification\.source_type = 'announcements'[\s\S]*notification\.source_id = p_id/i,
    );
    expect(announcementNotificationCleanup).toMatch(
      /assistance_require_role\([\s\S]*array\['admin','barangay_health_worker'\]/i,
    );
    expect(announcementNotificationCleanup).toMatch(
      /'announcement\.archived'[\s\S]*'announcements'[\s\S]*p_id/i,
    );
    expect(announcementNotificationCleanup).not.toMatch(
      /delete from public\.(?:announcements|audit_logs)/i,
    );
  });

  it("limits permanent announcement deletion to active Administrators and archived rows", () => {
    expect(permanentAnnouncementDeletion).toMatch(
      /function public\.announcement_delete\([\s\S]*security definer[\s\S]*set search_path = ''/i,
    );
    expect(permanentAnnouncementDeletion).toMatch(
      /assistance_require_role\([\s\S]*array\['admin'\]::public\.app_role\[\]/i,
    );
    expect(permanentAnnouncementDeletion).not.toMatch(
      /array\[[^\]]*'(?:barangay_health_worker|nurse|midwife|resident)'/i,
    );
    expect(permanentAnnouncementDeletion).toMatch(
      /where announcement\.id = p_id\s+for update[\s\S]*announcement must be archived before permanent deletion/i,
    );
  });

  it("rejects missing, stale, and invalid permanent deletion targets", () => {
    expect(permanentAnnouncementDeletion).toMatch(
      /p_expected_version is null[\s\S]*invalid announcement deletion request[\s\S]*errcode = '22023'/i,
    );
    expect(permanentAnnouncementDeletion).toMatch(
      /if not found then\s+raise exception 'announcement not found' using errcode = 'P0002'/i,
    );
    expect(permanentAnnouncementDeletion).toMatch(
      /current_record\.version <> p_expected_version[\s\S]*announcement changed by another user/i,
    );
  });

  it("deletes only trusted source-linked notifications and the selected announcement", () => {
    expect(permanentAnnouncementDeletion).toMatch(
      /delete from public\.assistance_notifications as notification\s+where notification\.source_type = 'announcements'\s+and notification\.source_id = p_id/i,
    );
    expect(permanentAnnouncementDeletion).not.toMatch(
      /(?:title|summary|dedup_key)\s*(?:=|like|ilike)/i,
    );
    expect(permanentAnnouncementDeletion).toMatch(
      /delete from public\.announcements as announcement\s+where announcement\.id = p_id\s+and announcement\.version = p_expected_version\s+and announcement\.archived_at is not null/i,
    );
    expect(permanentAnnouncementDeletion).not.toMatch(
      /delete from public\.(?:profiles|residents|appointments|health_encounters|audit_logs|outbound_notification_jobs)/i,
    );
  });

  it("records a minimized append-only audit before permanent deletion", () => {
    const auditPosition = permanentAnnouncementDeletion.indexOf(
      "'announcement.deleted'",
    );
    const deletePosition = permanentAnnouncementDeletion.indexOf(
      "delete from public.announcements as announcement",
    );
    expect(auditPosition).toBeGreaterThan(-1);
    expect(deletePosition).toBeGreaterThan(auditPosition);
    expect(permanentAnnouncementDeletion).toContain(
      "'Permanently deleted archived announcement'",
    );
    expect(permanentAnnouncementDeletion).not.toMatch(
      /assistance_audit\([\s\S]*current_record\.(?:title|content)/i,
    );
  });

  it("keeps permanent deletion RPC-only and leaves AI grounding unchanged", () => {
    expect(permanentAnnouncementDeletion).toMatch(
      /revoke all on function public\.announcement_delete\(uuid, bigint\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(permanentAnnouncementDeletion).toMatch(
      /grant execute on function public\.announcement_delete\(uuid, bigint\)[\s\S]*to authenticated, service_role/i,
    );
    expect(permanentAnnouncementDeletion).not.toMatch(
      /grant\s+delete\s+on\s+(?:table\s+)?public\.(?:announcements|assistance_notifications)/i,
    );
    expect(permanentAnnouncementDeletion).not.toMatch(
      /(?:create or replace|drop) function public\.ai_grounding_context/i,
    );
  });

  it("limits notifications and resident activity to the authenticated owner", () => {
    expect(migration).toMatch(
      /recipient_profile_id=auth\.uid\(\)[\s\S]*available_at<=now\(\)/i,
    );
    expect(migration).toMatch(
      /function public\.assistance_notification_read\(\s*p_id uuid\s*\)[\s\S]*where id=p_id and recipient_profile_id=auth\.uid\(\)/i,
    );
    expect(migration).toMatch(
      /r\.linked_profile_id=auth\.uid\(\)[\s\S]*a\.entity_type='appointments'/i,
    );
    expect(migration).toMatch(
      /r\.linked_profile_id=auth\.uid\(\)[\s\S]*a\.entity_type='health_encounters'/i,
    );
    expect(migration).not.toMatch(
      /\b(?:chief_complaint|subjective_notes|objective_notes|assessment|diagnosis_text|treatment_notes|risk_notes|developmental_notes)\b/i,
    );
  });

  it("creates concise event notifications from trusted row relationships", () => {
    expect(migration).toMatch(
      /create trigger appointments_assistance_notifications/i,
    );
    expect(migration).toMatch(
      /select r\.linked_profile_id into resident_profile from public\.residents/i,
    );
    expect(migration).toMatch(
      /create trigger health_encounters_assistance_notifications/i,
    );
    expect(migration).toMatch(
      /maternal_pregnancies[\s\S]*child_health_visits[\s\S]*assistance_notify_maternal_child/i,
    );
    expect(migration).toMatch(/unique\(recipient_profile_id,\s*dedup_key\)/i);
  });

  it("enforces the resident inquiry ownership and staff workflow", () => {
    expect(migration).toMatch(
      /linked_profile_id=auth\.uid\(\)[\s\S]*status='active'[\s\S]*archived_at is null/i,
    );
    expect(migration).toMatch(
      /actor_role in \('admin','barangay_health_worker'\)[\s\S]*or i\.resident_profile_id=auth\.uid\(\)/i,
    );
    expect(migration).toMatch(/closed inquiry cannot be changed/i);
    expect(migration).toMatch(
      /unique index resident_inquiries_request_unique[\s\S]*resident_profile_id,\s*request_key/i,
    );
  });

  it("audits every required assistance action without payload values", () => {
    for (const action of [
      "announcement.created",
      "announcement.updated",
      "announcement.archived",
      "announcement.pinned",
      "notification.read",
      "notification.read_all",
      "inquiry.created",
      "inquiry.status_changed",
    ]) {
      expect(migration).toContain(`'${action}'`);
    }
    expect(migration).toMatch(
      /jsonb_build_object\('changed_fields',\s*p_changed_fields\)/i,
    );
  });

  it("validates bounded public-information lists at the trusted boundary", () => {
    expect(migration).toMatch(
      /cardinality\(coalesce\(p_emergency_contacts,'\{\}'\)\) > 20/i,
    );
    expect(migration).toMatch(/char_length\(btrim\(item\.value\)\) > 500/i);
    expect(migration).toMatch(
      /raise exception 'invalid health center information'/i,
    );
  });
});
