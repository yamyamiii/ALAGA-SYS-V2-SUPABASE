import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const migrationsDirectory = path.join(root, "supabase", "migrations");
const expectedMigrations = [
  "20260720000100_extensions_and_enums.sql",
  "20260720000200_profiles_and_auth_trigger.sql",
  "20260720000300_locations_and_households.sql",
  "20260720000400_residents.sql",
  "20260720000500_household_head_relationship.sql",
  "20260720000600_appointments.sql",
  "20260720000700_audit_logs.sql",
  "20260720000800_helper_functions_and_triggers.sql",
  "20260720000900_indexes.sql",
  "20260720001000_rls_policies.sql",
  "20260720001100_grants_and_privilege_hardening.sql",
  "20260720001200_trusted_user_management.sql",
  "20260720001300_resident_archived_status.sql",
  "20260720001400_registry_workflows.sql",
  "20260720001500_bagongpook_deployment.sql",
  "20260720001600_registry_hardening.sql",
  "20260720001700_reconcile_bagongpook_reference.sql",
  "20260720001800_appointment_workflows.sql",
  "20260720001900_fix_appointment_rpc_contracts.sql",
  "20260720002000_health_records_foundation.sql",
  "20260720002100_fix_clinical_manila_dates.sql",
  "20260720002200_resident_appointment_requests.sql",
  "20260720002300_simplify_resident_request_duration.sql",
  "20260720002400_maternal_child_care.sql",
  "20260720002500_fix_maternal_child_trigger_columns.sql",
  "20260720002600_reports_analytics.sql",
  "20260720002700_general_assistance.sql",
  "20260720002800_final_qa_fixes.sql",
  "20260720002900_ai_assistant_rate_limit.sql",
  "20260720003000_ai_grounding_context.sql",
  "20260720003100_printable_healthcare_documents.sql",
  "20260720003200_outbound_notification_foundation.sql",
  "20260720003300_backup_restore_foundation.sql",
  "20260720003400_production_security_hardening.sql",
  "20260720003500_resident_clinical_document_safety.sql",
  "20260720003600_optional_resident_appointment_reason.sql",
  "20260720003700_preserve_optional_resident_appointment_reason.sql",
  "20260720003800_optional_resident_cancellation_reason.sql",
  "20260720003900_fix_reschedule_propagation_notifications.sql",
  "20260720004000_enforce_single_row_appointment_lifecycle.sql",
  "20260720004100_optional_authorized_cancellation_reason.sql",
  "20260720004200_simplify_appointment_completion.sql",
  "20260720004300_cleanup_archived_announcement_notifications.sql",
  "20260720004400_resident_self_registration.sql",
  "20260720004500_fix_resident_registration_approval.sql",
  "20260720004600_guard_resident_account_deletion.sql",
  "20260720004700_extend_safe_resident_account_deletion.sql",
  "20260720004800_fix_resident_delete_ambiguity.sql",
  "20260720004900_generalize_safe_account_deletion.sql",
  "20260720005000_fix_resident_household_unassignment.sql",
  "20260720005100_archive_sole_member_household.sql",
  "20260720005200_fix_account_cleanup_eligibility.sql",
  "20260720005300_retire_protected_accounts.sql",
  "20260720005400_resident_registration_notification_type.sql",
  "20260720005500_notify_pending_resident_registration.sql",
  "20260720005600_enforce_appointment_start_slots.sql",
];
const completedMigrationHashes = {
  "20260720000100_extensions_and_enums.sql":
    "4a26c3b621bba5785c9007b75c65aed8c828ab010523d10f4ac7b510ed8bef0c",
  "20260720000200_profiles_and_auth_trigger.sql":
    "db2101e09717823b040bebf46e2b9ed06bdf47eb5db36d04fa312dde9ec2d70c",
  "20260720000300_locations_and_households.sql":
    "887778c2c3b106c49aab5f26938d5356cf35f09ac2731ce8adc8e0760467d959",
  "20260720000400_residents.sql":
    "21b3fbff1b5e4711329467e398b3fc1d80de31786607ccb80efb1ab8e03b9283",
  "20260720000500_household_head_relationship.sql":
    "e62a6e7dabe06e8c863e9d1c13c1a2d19df3db624f425e8ee5c5b08e720cc33e",
  "20260720000600_appointments.sql":
    "8d098aabeda331b3993cf2182f7a73658f42a2413757a972c4693a105733142a",
  "20260720000700_audit_logs.sql":
    "378f8416d2f85039ef20165988c8c4e13092ac5404a5d58b299c66c54f960cbb",
  "20260720000800_helper_functions_and_triggers.sql":
    "4d5c72215851272972b926ebb65d5e7cacba2d4968598a06a5482305702290c9",
  "20260720000900_indexes.sql":
    "b3dc84dcb252792a299d23fd6b50bca2967a9f07734480d99a6e0ab6b45233be",
  "20260720001000_rls_policies.sql":
    "3de14167399edd7e9e217316971aa8914d221c2d4f85cb79b45f345118284214",
  "20260720001100_grants_and_privilege_hardening.sql":
    "71d8faacc421b6542a5328d0a58501fb315700e1fb22a66f87d590a87ae43ba8",
  "20260720001200_trusted_user_management.sql":
    "ae0f5a82b3c27efaeb36f8a3fe4349dad54f4a5e2562a61c36930859b93285cf",
  "20260720001300_resident_archived_status.sql":
    "ece7d1df7b482fd3e9c3c0d68f5258470af91b2854be4be59f9eb0f340a9aa1f",
  "20260720001400_registry_workflows.sql":
    "2605ea2c5c8d26d4ec17f63e4bdfece8fa13201553eab82533c12414d1971336",
  "20260720001500_bagongpook_deployment.sql":
    "e1a300fc175030195caafbac612a7581b68f53b4d990802aaa1a5d78da534b3b",
  "20260720001600_registry_hardening.sql":
    "43b4a14947d3c19e77fb3ad42699a0879333671268fcaf7d7f6f57d1b58358c0",
  "20260720001700_reconcile_bagongpook_reference.sql":
    "9556cf24c8cfd21571e067b2937146b17df1e34102af1af09eaa5ffa03dbf27a",
  "20260720001800_appointment_workflows.sql":
    "48ae971ab31b2f60ab9134aa82a6e6951b9a329e2615ceba1beede422f6a12e4",
  "20260720001900_fix_appointment_rpc_contracts.sql":
    "c6893be3aa0c072a6e924a6229c052cca3ed7e002e4eca0b352b2cb1155fb55c",
  "20260720002000_health_records_foundation.sql":
    "384c8eb23e083f90df91900b5e9b35d60e32abb85b2a3e210ea77d0eb6ebae54",
  "20260720002100_fix_clinical_manila_dates.sql":
    "e332e611c0f3da60a61851bb72595534d73d51186afa3f717edce8be0a92092f",
  "20260720002200_resident_appointment_requests.sql":
    "cb42ae34dc5c6e864428f00e22f1cc3c7b8d81d571e5a214a253929c781d3123",
  "20260720002300_simplify_resident_request_duration.sql":
    "3fed17be6baacbc2b33e74ebc51dbfb06f18f8e1dbe7b6a17ca2484548f672eb",
  "20260720002400_maternal_child_care.sql":
    "4434f2a7504204996b795714d69a5be1d8550b771950ae0a625c5478cf3d3cc9",
  "20260720002500_fix_maternal_child_trigger_columns.sql":
    "6f19338b1d8b04d0d278b2987cf4e13d427cf758d986efa7ce9c06954f08ff41",
  "20260720002600_reports_analytics.sql":
    "7ed101a662168b37235ff583c1efe4556f147db93f52e93468e8af4962f90ba3",
  "20260720002700_general_assistance.sql":
    "dcffe0bf7d90408e198eaa57ac6c237b99f3f20d73617896bc5858a6d41d5bfe",
  "20260720002800_final_qa_fixes.sql":
    "252cb4306ec04fafcdd3cc3774c8f44563a882c61f561da1ad5ae60bc0dc676b",
  "20260720002900_ai_assistant_rate_limit.sql":
    "f0045e8159826e46fa2b7eab65a0a2a1692e40c4f6fc4aed2991971fcb46655a",
  "20260720004400_resident_self_registration.sql":
    "9344ca9d60c27ae861e90bc294b2c60761e745e096b699e77aef3f588b08b88b",
  "20260720004500_fix_resident_registration_approval.sql":
    "a5aa30184191b65c253347ebd4f0a8d19bfc67b457590e93fea4dad6196600fb",
  "20260720004600_guard_resident_account_deletion.sql":
    "625ee0cd5b74867a15db0e8a68d808a3763f16a0109113d42fce491928e1664e",
  "20260720004700_extend_safe_resident_account_deletion.sql":
    "b3e9c8ad0fe0cc63c1a49a80657a9a62e09c3b6dbe49e9e10d7bd6b3d707025a",
  "20260720004800_fix_resident_delete_ambiguity.sql":
    "0b57d56d527f9a9e835b01c63d4f0e57835c0155b1efd67d5095f5de60b5a0b5",
  "20260720004900_generalize_safe_account_deletion.sql":
    "b88104ac700ae8610f338d9402d292f0c7131c38a87e44db8e7a5547f588c9d9",
  "20260720005000_fix_resident_household_unassignment.sql":
    "3147a7c263b20b0264fca2f55abc085dcb2a05c444b35d856f078f611c1f4ce9",
  "20260720005100_archive_sole_member_household.sql":
    "5e8fb7d62655fb1ffb563c318bfb27e82114f3a234c3f1987e9e91e573f73406",
};
const reviewedPendingMigrationHashes = {
  "20260720003000_ai_grounding_context.sql":
    "911a4ac9e22d94d10b97b7febe2aed6ca35543556b6c356d05f595609a89d979",
  "20260720003100_printable_healthcare_documents.sql":
    "63462f37fb2c67f9e0971935742e934b8a8834cbe3f1c9d29f588fe11c5d4847",
  "20260720003200_outbound_notification_foundation.sql":
    "cbce86c0bd20e74aeec8d9ab51ceb66dc6e6e44330e629cf73dd3f8045e23929",
  "20260720003300_backup_restore_foundation.sql":
    "394793a2449680175e30134298bd35e8edbeeafd1fbef349b593853020ade519",
  "20260720003400_production_security_hardening.sql":
    "08643a1e9a2d2431de8ea2a88af85784f3f622572395ba28cda3ac17fb42e5de",
  "20260720003500_resident_clinical_document_safety.sql":
    "5016961c83cce82c199a410c258760d4a6a156c4a61f785c6920a18998fbbe05",
  "20260720003600_optional_resident_appointment_reason.sql":
    "e793f0d1836c6db97e685afa4b5bb965c0683a745e8851041775576c7380d21d",
  "20260720003700_preserve_optional_resident_appointment_reason.sql":
    "40b5cd2d5015185f66fe0e6aa447ed9ab5f99d2660ec5eb38d670e1fc5c1ae12",
  "20260720003800_optional_resident_cancellation_reason.sql":
    "855d42d047d885ff8280418974e7c6a10ded9bdfc6314eff3c38f34bbc2624ee",
  "20260720003900_fix_reschedule_propagation_notifications.sql":
    "602ad1cf8a8195e7ceb3c30550ef115628f2b0d59908f24f88ca38a5802647a3",
  "20260720004000_enforce_single_row_appointment_lifecycle.sql":
    "041dd1fd15ae302e5f899dd94bb6ddb6329f991d67551917486483ba79b3e8bd",
  "20260720004100_optional_authorized_cancellation_reason.sql":
    "15ad5784562fc387cfe1c60f00c616e9ad2b8585e5a2fca3597365130cde39e0",
  "20260720004200_simplify_appointment_completion.sql":
    "cbedfb8940d720b278bb548248fbdfe9740c8c6420c056ff074f2506e934a448",
  "20260720004300_cleanup_archived_announcement_notifications.sql":
    "503aaa16bdc1f13ce6a3c503c674741a2abf8beeda2b1db6786e28e874f22346",
};
const expectedTables = [
  "account_retirements",
  "admin_action_rate_limits",
  "ai_request_rate_limits",
  "announcements",
  "appointment_request_events",
  "appointments",
  "assistance_notifications",
  "audit_logs",
  "backup_configuration",
  "backup_jobs",
  "barangays",
  "child_growth_measurements",
  "child_health_profiles",
  "child_health_visits",
  "child_immunizations",
  "clinical_referrals",
  "faq_entries",
  "health_center_information",
  "health_encounters",
  "households",
  "maternal_delivery_outcomes",
  "maternal_postnatal_visits",
  "maternal_pregnancies",
  "maternal_prenatal_visits",
  "notification_delivery_attempts",
  "notification_preferences",
  "outbound_notification_channel_status",
  "outbound_notification_jobs",
  "profiles",
  "puroks",
  "resident_account_deletion_staging",
  "resident_allergies",
  "resident_inquiries",
  "resident_medical_history",
  "resident_registration_requests",
  "residents",
  "restore_jobs",
  "vital_signs",
];

const failures = [];
const checks = [];

function check(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

function auditPlpgsqlIntoTargets(sql) {
  const undeclared = [];
  const functions = [
    ...sql.matchAll(
      /create or replace function public\.([a-z_][a-z0-9_]*)\s*\([\s\S]*?\)\s*returns[\s\S]*?language plpgsql[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi,
    ),
  ];

  for (const [, functionName, body] of functions) {
    const declarationBlock =
      body.match(/^\s*declare\s+([\s\S]*?)\bbegin\b/i)?.[1] ?? "";
    const declared = new Set(
      [...declarationBlock.matchAll(/^\s*([a-z_][a-z0-9_]*)\s+/gim)].map(
        (declaration) => declaration[1].toLowerCase(),
      ),
    );
    const targets = new Set();

    for (const statement of body.split(";")) {
      for (const target of statement.matchAll(
        /\bselect\b[\s\S]*?\binto\s+(?:strict\s+)?([a-z_][a-z0-9_]*)/gi,
      )) {
        targets.add(target[1].toLowerCase());
      }
      for (const target of statement.matchAll(
        /\breturning\b[\s\S]*?\binto\s+([a-z_][a-z0-9_]*)/gi,
      )) {
        targets.add(target[1].toLowerCase());
      }
    }

    for (const target of targets) {
      if (!declared.has(target)) {
        undeclared.push(`${functionName}.${target}`);
      }
    }
  }

  return { functionCount: functions.length, undeclared };
}

const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

check(
  JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrations),
  "Exactly fifty-six expected migrations exist in lexical order",
);

const migrationEntries = migrationFiles.map((file) => ({
  file,
  sql: fs.readFileSync(path.join(migrationsDirectory, file), "utf8"),
}));
const allSql = migrationEntries.map(({ sql }) => sql).join("\n");
const securityHardeningMigration =
  migrationEntries.find(({ file }) =>
    file.includes("production_security_hardening"),
  )?.sql ?? "";
const residentApprovalCorrection =
  migrationEntries.find(({ file }) =>
    file.includes("fix_resident_registration_approval"),
  )?.sql ?? "";
const residentAccountDeletionGuard =
  migrationEntries.find(({ file }) =>
    file.includes("guard_resident_account_deletion"),
  )?.sql ?? "";
const residentAccountDeletionExtension =
  migrationEntries.find(({ file }) =>
    file.includes("extend_safe_resident_account_deletion"),
  )?.sql ?? "";
const residentAccountDeletionAmbiguityFix =
  migrationEntries.find(({ file }) =>
    file.includes("fix_resident_delete_ambiguity"),
  )?.sql ?? "";
const generalizedAccountDeletion =
  migrationEntries.find(({ file }) =>
    file.includes("generalize_safe_account_deletion"),
  )?.sql ?? "";
const accountCleanupEligibility =
  migrationEntries.find(({ file }) =>
    file.includes("fix_account_cleanup_eligibility"),
  )?.sql ?? "";
const protectedAccountRetirement =
  migrationEntries.find(({ file }) =>
    file.includes("retire_protected_accounts"),
  )?.sql ?? "";
const residentRegistrationNotificationType =
  migrationEntries.find(({ file }) =>
    file.includes("resident_registration_notification_type"),
  )?.sql ?? "";
const residentRegistrationNotification =
  migrationEntries.find(({ file }) =>
    file.includes("notify_pending_resident_registration"),
  )?.sql ?? "";

check(
  /current_resident_id\(\)[\s\S]*p\.account_status = 'active'[\s\S]*p\.role = 'resident'[\s\S]*r\.status = 'active'[\s\S]*r\.archived_at is null/i.test(
    securityHardeningMigration,
  ) &&
    /current_household_id\(\)[\s\S]*p\.account_status = 'active'[\s\S]*p\.role = 'resident'[\s\S]*r\.status = 'active'[\s\S]*r\.archived_at is null/i.test(
      securityHardeningMigration,
    ),
  "Resident identity helpers require an active resident account and record",
);
check(
  /create policy profiles_update_own[\s\S]*current_profile_role\(\) is not null[\s\S]*with check[\s\S]*current_profile_role\(\) is not null/i.test(
    securityHardeningMigration,
  ) &&
    /create policy residents_select_own[\s\S]*id = public\.current_resident_id\(\)/i.test(
      securityHardeningMigration,
    ),
  "Inactive accounts cannot mutate profiles or use resident self-read policies",
);
check(
  (
    securityHardeningMigration.match(
      /actor_role public\.app_role := public\.current_profile_role\(\)/gi,
    ) ?? []
  ).length === 2 &&
    (
      securityHardeningMigration.match(
        /actor_id is null or actor_role is null/gi,
      ) ?? []
    ).length === 2 &&
    /errcode = '42501'/i.test(securityHardeningMigration),
  "Notification preference RPCs explicitly reject inactive authenticated profiles",
);
check(
  /alter function public\.report_validate_scope\([\s\S]*\) stable/i.test(
    securityHardeningMigration,
  ) &&
    /alter function public\.admin_list_resident_link_candidates\([\s\S]*\) volatile/i.test(
      securityHardeningMigration,
    ) &&
    /alter function public\.admin_get_resident_account\(uuid,uuid\) volatile/i.test(
      securityHardeningMigration,
    ),
  "Function volatility matches read-only reports and context-setting admin lookups",
);
check(
  /admin_approve_resident_registration[\s\S]*assert_active_administrator\(p_actor_id\)[\s\S]*set_config\('app\.trusted_resident_linking', 'on', true\)[\s\S]*(?:update|insert into) public\.residents/i.test(
    residentApprovalCorrection,
  ),
  "Resident registration approval enables trusted linking after Administrator validation",
);
check(
  /request_record\.version <> p_expected_version/i.test(
    residentApprovalCorrection,
  ) &&
    /possible resident match requires explicit linkage review/i.test(
      residentApprovalCorrection,
    ),
  "Resident registration approval preserves concurrency and duplicate review",
);
check(
  /revoke all on function public\.admin_approve_resident_registration[\s\S]*from public, anon, authenticated/i.test(
    residentApprovalCorrection,
  ) &&
    /grant execute on function public\.admin_approve_resident_registration[\s\S]*to service_role/i.test(
      residentApprovalCorrection,
    ) &&
    !/grant execute on function public\.admin_approve_resident_registration[\s\S]*to authenticated/i.test(
      residentApprovalCorrection,
    ),
  "Resident registration approval remains service-role-only",
);
check(
  /admin_prepare_resident_account_deletion[\s\S]*assert_active_administrator\(p_actor_id\)[\s\S]*registration_record\.status not in \([\s\S]*'pending'[\s\S]*'rejected'/i.test(
    residentAccountDeletionGuard,
  ) &&
    /where resident\.linked_profile_id = p_target_profile_id[\s\S]*cannot be permanently deleted/i.test(
      residentAccountDeletionGuard,
    ),
  "Permanent account deletion is limited to unlinked pending or rejected self-registrations",
);
check(
  /pg_catalog\.pg_constraint[\s\S]*resident_account_delete_protected_dependencies/i.test(
    residentAccountDeletionGuard,
  ) &&
    !/delete from public\.(appointments|health_encounters|residents|audit_logs|clinical_referrals)/i.test(
      residentAccountDeletionGuard,
    ),
  "Permanent account deletion fails closed on protected dependencies",
);
check(
  /revoke all on function public\.admin_prepare_resident_account_deletion[\s\S]*from public, anon, authenticated/i.test(
    residentAccountDeletionGuard,
  ) &&
    /grant execute on function public\.admin_prepare_resident_account_deletion[\s\S]*to service_role/i.test(
      residentAccountDeletionGuard,
    ) &&
    !/grant execute on function public\.admin_prepare_resident_account_deletion[\s\S]*to authenticated/i.test(
      residentAccountDeletionGuard,
    ),
  "Permanent account deletion remains Administrator-validated and service-role-only",
);
check(
  /create table public\.resident_account_deletion_staging[\s\S]*enable row level security[\s\S]*revoke all on table public\.resident_account_deletion_staging[\s\S]*from public, anon, authenticated, service_role/i.test(
    residentAccountDeletionExtension,
  ),
  "Resident deletion compensation snapshots remain browser- and service-role-inaccessible",
);
check(
  /resident_account_deletion_blocker[\s\S]*pg_catalog\.pg_constraint[\s\S]*foreign_key\.confrelid = 'public\.profiles'::pg_catalog\.regclass[\s\S]*foreign_key\.confrelid = 'public\.residents'::pg_catalog\.regclass/i.test(
    residentAccountDeletionExtension,
  ) &&
    /unknown_profile_reference[\s\S]*unknown_resident_reference/i.test(
      residentAccountDeletionExtension,
    ),
  "Linked Resident deletion checks current and future profile/Resident dependencies",
);
check(
  /admin_prepare_resident_account_deletion[\s\S]*registration_record\.status not in \([\s\S]*'pending'[\s\S]*'rejected'[\s\S]*'approved'[\s\S]*set account_status = 'suspended'[\s\S]*delete from public\.resident_registration_requests[\s\S]*delete from public\.residents/i.test(
    residentAccountDeletionExtension,
  ),
  "Dependency-free pending, rejected, approved, and active Resident accounts use an atomic prepare boundary",
);
check(
  /admin_restore_resident_account_deletion[\s\S]*app\.trusted_resident_account_restore[\s\S]*insert into public\.residents[\s\S]*insert into public\.resident_registration_requests[\s\S]*insert into public\.notification_preferences[\s\S]*staged_record\.previous_account_status/i.test(
    residentAccountDeletionExtension,
  ),
  "Auth deletion failure restores staged Resident identity and disposable state",
);
check(
  !/delete from public\.(appointments|health_encounters|vital_signs|resident_allergies|resident_medical_history|clinical_referrals|resident_inquiries|outbound_notification_jobs|audit_logs)/i.test(
    residentAccountDeletionExtension,
  ) &&
    /grant execute on function public\.admin_resident_account_deletion_eligibility[\s\S]*to service_role/i.test(
      residentAccountDeletionExtension,
    ) &&
    !/grant (delete|all) on (table )?public\.(residents|profiles)[\s\S]*to authenticated/i.test(
      residentAccountDeletionExtension,
    ),
  "Resident account deletion preserves protected history and grants no browser mutation capability",
);
check(
  /returns table \(\s*profile_id uuid,\s*registration_id uuid,\s*previous_account_status public\.account_status\s*\)/i.test(
    residentAccountDeletionAmbiguityFix,
  ) &&
    /delete from public\.notification_preferences as preferences_to_delete\s*where preferences_to_delete\.profile_id = target_profile\.id/i.test(
      residentAccountDeletionAmbiguityFix,
    ) &&
    /delete from public\.resident_registration_requests as registration_to_delete\s*where registration_to_delete\.profile_id = target_profile\.id/i.test(
      residentAccountDeletionAmbiguityFix,
    ) &&
    !/where\s+(profile_id|registration_id|previous_account_status)\s*[=<>]/i.test(
      residentAccountDeletionAmbiguityFix,
    ),
  "Resident deletion predicates cannot collide with PL/pgSQL OUT parameters",
);
check(
  /create or replace function public\.admin_restore_resident_account_deletion[\s\S]*update public\.profiles as profile_to_restore[\s\S]*where profile_to_restore\.id = p_target_profile_id[\s\S]*delete from public\.resident_account_deletion_staging as staging_to_delete[\s\S]*where staging_to_delete\.profile_id = p_target_profile_id/i.test(
    residentAccountDeletionAmbiguityFix,
  ),
  "Resident deletion compensation uses qualified target predicates",
);
check(
  /admin_prepare_resident_account_deletion[\s\S]*assert_active_administrator\(p_actor_id\)[\s\S]*for update[\s\S]*resident_account_deletion_blocker[\s\S]*account\.permanent_delete_prepared/i.test(
    residentAccountDeletionAmbiguityFix,
  ) &&
    /revoke all on function public\.admin_prepare_resident_account_deletion[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.admin_prepare_resident_account_deletion[\s\S]*to service_role/i.test(
      residentAccountDeletionAmbiguityFix,
    ) &&
    !/grant execute on function public\.admin_(prepare|restore)_resident_account_deletion[\s\S]*to authenticated/i.test(
      residentAccountDeletionAmbiguityFix,
    ),
  "Migration 48 preserves deletion guards and service-role-only execution",
);
check(
  /admin_prepare_account_deletion[\s\S]*assert_active_administrator\(p_actor_id\)[\s\S]*'resident'::public\.app_role[\s\S]*'barangay_health_worker'::public\.app_role[\s\S]*'nurse'::public\.app_role[\s\S]*'midwife'::public\.app_role/i.test(
    generalizedAccountDeletion,
  ) &&
    /Administrator accounts cannot be permanently deleted/i.test(
      generalizedAccountDeletion,
    ) &&
    /if p_target_profile_id = p_actor_id[\s\S]*errcode = '42501'/i.test(
      generalizedAccountDeletion,
    ),
  "General account deletion supports only non-Administrator targets and preserves self-delete protection",
);
check(
  /admin_prepare_account_deletion[\s\S]*for update[\s\S]*resident_account_deletion_blocker[\s\S]*account\.permanent_delete_prepared/i.test(
    generalizedAccountDeletion,
  ) &&
    /admin_restore_account_deletion[\s\S]*account\.permanent_delete_restored/i.test(
      generalizedAccountDeletion,
    ),
  "General account deletion locks, checks, stages, audits, and compensates safely",
);
check(
  !/delete from public\.(appointments|health_encounters|vital_signs|resident_allergies|resident_medical_history|clinical_referrals|resident_inquiries|outbound_notification_jobs|audit_logs|announcements)/i.test(
    generalizedAccountDeletion,
  ) &&
    /delete from public\.notification_preferences as preferences_to_delete/i.test(
      generalizedAccountDeletion,
    ) &&
    /if has_resident then\s*delete from public\.residents as resident_to_delete/i.test(
      generalizedAccountDeletion,
    ),
  "General account deletion removes only staged Resident identity and disposable account state",
);
check(
  /revoke all on function public\.admin_account_deletion_eligibility[\s\S]*from public, anon, authenticated, service_role/i.test(
    generalizedAccountDeletion,
  ) &&
    /revoke all on function public\.admin_prepare_account_deletion[\s\S]*from public, anon, authenticated, service_role/i.test(
      generalizedAccountDeletion,
    ) &&
    /revoke all on function public\.admin_restore_account_deletion[\s\S]*from public, anon, authenticated, service_role/i.test(
      generalizedAccountDeletion,
    ) &&
    /grant execute on function public\.admin_account_deletion_eligibility[\s\S]*to service_role/i.test(
      generalizedAccountDeletion,
    ) &&
    /grant execute on function public\.admin_prepare_account_deletion[\s\S]*to service_role/i.test(
      generalizedAccountDeletion,
    ) &&
    /grant execute on function public\.admin_restore_account_deletion[\s\S]*to service_role/i.test(
      generalizedAccountDeletion,
    ) &&
    !/grant execute on function public\.admin_(account_deletion_eligibility|prepare_account_deletion|restore_account_deletion)[\s\S]*to authenticated/i.test(
      generalizedAccountDeletion,
    ),
  "General account deletion RPCs remain service-role-only",
);
check(
  /where profile_to_suspend\.id = target_profile\.id/i.test(
    generalizedAccountDeletion,
  ) &&
    /where preferences_to_delete\.profile_id = target_profile\.id/i.test(
      generalizedAccountDeletion,
    ) &&
    /where registration_to_delete\.profile_id = target_profile\.id/i.test(
      generalizedAccountDeletion,
    ) &&
    /where resident_to_delete\.id = resident_record\.id/i.test(
      generalizedAccountDeletion,
    ) &&
    !/where\s+(profile_id|registration_id|previous_account_status|resident_id|status|version|id)\s*[=<>]/i.test(
      generalizedAccountDeletion,
    ),
  "Migration 49 qualifies deletion predicates against PL/pgSQL and OUT names",
);
check(
  /resident_account_deletion_blocker[\s\S]*'active'::public\.resident_status[\s\S]*'inactive'::public\.resident_status[\s\S]*'archived'::public\.resident_status[\s\S]*resident_protected_lifecycle/i.test(
    accountCleanupEligibility,
  ) && !/return 'resident_archived'/i.test(accountCleanupEligibility),
  "Archived Resident identity alone does not block dependency-safe account cleanup",
);
check(
  /admin_account_deletion_assessment[\s\S]*assert_active_administrator\(p_actor_id\)[\s\S]*resident_account_deletion_blocker[\s\S]*appointment_history[\s\S]*clinical_history[\s\S]*audit_history/i.test(
    accountCleanupEligibility,
  ) &&
    /revoke all on function public\.admin_account_deletion_assessment[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.admin_account_deletion_assessment[\s\S]*to service_role/i.test(
      accountCleanupEligibility,
    ) &&
    !/grant execute on function public\.admin_account_deletion_assessment[\s\S]*to authenticated/i.test(
      accountCleanupEligibility,
    ),
  "Account cleanup assessment returns only service-role-scoped non-sensitive blocker categories",
);
const retirementDeclarationAudit = auditPlpgsqlIntoTargets(
  protectedAccountRetirement,
);
check(
  retirementDeclarationAudit.functionCount === 6 &&
    retirementDeclarationAudit.undeclared.length === 0,
  "Every account-retirement PL/pgSQL SELECT INTO target is declared",
);
check(
  /add column retired_at timestamptz/i.test(protectedAccountRetirement) &&
    /create table public\.account_retirements/i.test(
      protectedAccountRetirement,
    ) &&
    /account_status = 'inactive'::public\.account_status/i.test(
      protectedAccountRetirement,
    ) &&
    !/delete from public\.(?:profiles|residents|appointments|health_encounters|audit_logs)/i.test(
      protectedAccountRetirement,
    ),
  "Protected-history retirement retains profile and operational records",
);
check(
  /admin_prepare_account_retirement[\s\S]*assert_active_administrator\(p_actor_id\)[\s\S]*p_target_profile_id = p_actor_id[\s\S]*Administrator accounts cannot be retired/i.test(
    protectedAccountRetirement,
  ) &&
    /deletion_assessment\.eligible[\s\S]*dependency-free accounts must use permanent deletion/i.test(
      protectedAccountRetirement,
    ) &&
    /appointment_history[\s\S]*clinical_history[\s\S]*audit_history/i.test(
      protectedAccountRetirement,
    ),
  "Account retirement is Administrator-only and requires protected history",
);
check(
  /protect_retired_profile_lifecycle[\s\S]*retired account profile is immutable/i.test(
    protectedAccountRetirement,
  ) &&
    /app\.trusted_account_retirement_restore/i.test(
      protectedAccountRetirement,
    ) &&
    /profile\.retired_at is null/i.test(protectedAccountRetirement),
  "Retired identities cannot reactivate and are excluded from normal management",
);
check(
  /revoke all on table public\.account_retirements[\s\S]*public, anon, authenticated, service_role/i.test(
    protectedAccountRetirement,
  ) &&
    /revoke all on function public\.admin_prepare_account_retirement[\s\S]*public, anon, authenticated, service_role/i.test(
      protectedAccountRetirement,
    ) &&
    /grant execute on function public\.admin_prepare_account_retirement[\s\S]*to service_role/i.test(
      protectedAccountRetirement,
    ) &&
    !/grant execute on function public\.admin_(?:prepare|restore)_account_retirement[^;]*to authenticated/i.test(
      protectedAccountRetirement,
    ),
  "Account retirement state and RPCs remain service-role-only",
);
check(
  /alter type public\.assistance_notification_type[\s\S]*add value if not exists 'resident_registration_pending'/i.test(
    residentRegistrationNotificationType,
  ) &&
    !/assistance_notifications|create trigger/i.test(
      residentRegistrationNotificationType,
    ),
  "Resident registration notification enum commits before later use",
);
const registrationNotificationDeclarationAudit = auditPlpgsqlIntoTargets(
  residentRegistrationNotification,
);
check(
  registrationNotificationDeclarationAudit.functionCount === 3 &&
    registrationNotificationDeclarationAudit.undeclared.length === 0,
  "Every registration-notification PL/pgSQL SELECT INTO target is declared",
);
check(
  /registration\.status = 'pending'::public\.resident_registration_status[\s\S]*auth_user\.email_confirmed_at is not null/i.test(
    residentRegistrationNotification,
  ) &&
    /after insert on public\.resident_registration_requests/i.test(
      residentRegistrationNotification,
    ) &&
    /after update of email_confirmed_at on auth\.users/i.test(
      residentRegistrationNotification,
    ),
  "Only confirmed pending Resident registrations become actionable notifications",
);
check(
  /from public\.profiles as administrator[\s\S]*administrator\.role = 'admin'::public\.app_role[\s\S]*administrator\.account_status = 'active'::public\.account_status/i.test(
    residentRegistrationNotification,
  ) &&
    /on conflict \(recipient_profile_id, dedup_key\) do nothing/i.test(
      residentRegistrationNotification,
    ),
  "Every active Administrator receives one deduplicated registration notification",
);
check(
  /'resident_registration',[\s\S]*p_registration_id,[\s\S]*'\/user-management'/i.test(
    residentRegistrationNotification,
  ) &&
    !/registration\.(?:first_name|middle_name|last_name|date_of_birth|phone_number|address_line)/i.test(
      residentRegistrationNotification,
    ),
  "Registration notifications use trusted navigation metadata without private applicant fields",
);
check(
  (
    residentRegistrationNotification.match(
      /revoke all on function public\.resident_registration_notify_[\s\S]*?from public, anon, authenticated, service_role/gi,
    ) ?? []
  ).length === 3 &&
    !/grant\s+(?:insert|update|delete|all)\s+on\s+(?:table\s+)?public\.assistance_notifications[^;]*authenticated/i.test(
      residentRegistrationNotification,
    ),
  "Registration notification creation remains unavailable to browser roles",
);

for (const [file, expectedHash] of Object.entries(completedMigrationHashes)) {
  const sql = fs.readFileSync(path.join(migrationsDirectory, file));
  const actualHash = crypto.createHash("sha256").update(sql).digest("hex");
  check(
    actualHash === expectedHash,
    `${file} remains byte-identical to its completed migration`,
  );
}
for (const [file, expectedHash] of Object.entries(
  reviewedPendingMigrationHashes,
)) {
  const sql = fs.readFileSync(path.join(migrationsDirectory, file));
  const actualHash = crypto.createHash("sha256").update(sql).digest("hex");
  check(
    actualHash === expectedHash,
    `${file} remains byte-identical to its reviewed pending migration`,
  );
}

for (const { file, sql } of migrationEntries) {
  check(
    (sql.match(/\$\$/g) ?? []).length % 2 === 0,
    `${file} has paired dollar quotes`,
  );
}

const createdTables = [
  ...allSql.matchAll(/create\s+table\s+public\.([a-z_]+)/gi),
]
  .map((match) => match[1])
  .sort();
check(
  JSON.stringify(createdTables) === JSON.stringify(expectedTables),
  "Only the expected foundation, operational, registry, and clinical tables are created",
);

const rlsTables = [
  ...allSql.matchAll(
    /alter\s+table\s+public\.([a-z_]+)\s+enable\s+row\s+level\s+security/gi,
  ),
]
  .map((match) => match[1])
  .sort();
check(
  JSON.stringify(rlsTables) === JSON.stringify(expectedTables),
  "RLS is enabled on every managed public table",
);

check(
  !/using\s*\(\s*true\s*\)/i.test(allSql),
  "No broad USING (true) policy exists",
);
check(
  !/with\s+check\s*\(\s*true\s*\)/i.test(allSql),
  "No broad WITH CHECK (true) policy exists",
);
check(
  !/on\s+public\.[a-z_]+\s+for\s+delete\s+to\s+(?:anon|authenticated)/i.test(
    allSql,
  ),
  "No client DELETE policy exists on public registry tables",
);
check(
  !/grant\s+[^;]*delete[^;]*to\s+(?:anon|authenticated)/i.test(allSql),
  "No client DELETE grant exists",
);
check(
  /drop\s+policy\s+if\s+exists\s+profiles_update_admin/i.test(allSql),
  "Direct browser-admin updates of other profiles are retired",
);
check(
  /alter\s+function\s+public\.audit_safe_snapshot\(text,\s*jsonb\)\s+stable/i.test(
    allSql,
  ),
  "The audit snapshot helper receives a forward-only STABLE volatility correction",
);
check(
  /protect_last_active_administrator/i.test(allSql) &&
    /pg_advisory_xact_lock/i.test(allSql),
  "The final active administrator has serialized database protection",
);
check(
  /grant\s+execute\s+on\s+function\s+public\.admin_update_user_role[\s\S]*?to\s+service_role/i.test(
    allSql,
  ),
  "Privileged role mutation is executable by service_role",
);
check(
  !/grant\s+execute\s+on\s+function\s+public\.admin_[a-z_]+[^;]*to\s+authenticated/i.test(
    allSql,
  ),
  "Privileged administrator RPCs are not executable by authenticated",
);
check(
  !/select\s+max\s*\(/i.test(allSql),
  "Number generation does not use SELECT MAX",
);
check(
  /nextval\('public\.resident_number_seq'\)/i.test(allSql),
  "Resident numbers use an atomic sequence",
);
check(
  /nextval\('public\.household_number_seq'\)/i.test(allSql),
  "Household numbers use an atomic sequence",
);
check(
  /nextval\('public\.appointment_number_seq'\)/i.test(allSql),
  "Appointment numbers use an atomic sequence",
);
check(
  /resident_number is database-generated and immutable/i.test(allSql),
  "Resident numbers are immutable",
);
check(
  /household_number is database-generated and immutable/i.test(allSql),
  "Household numbers are immutable",
);
check(
  /appointment_number is database-generated and immutable/i.test(allSql),
  "Appointment numbers are immutable",
);
check(
  /alter\s+type\s+public\.resident_status\s+add\s+value\s+if\s+not\s+exists\s+'archived'/i.test(
    migrationEntries.find(({ file }) =>
      file.includes("resident_archived_status"),
    )?.sql ?? "",
  ),
  "Resident archival receives a dedicated forward-only enum migration",
);
check(
  /security\s+invoker/i.test(
    migrationEntries.find(({ file }) => file.includes("registry_workflows"))
      ?.sql ?? "",
  ),
  "Registry list RPCs retain caller RLS with security invoker",
);
check(
  /household\.archived|resident\.archived/i.test(allSql) &&
    /changed_fields/i.test(allSql),
  "Registry audit actions use semantic names and safe changed-field metadata",
);
check(
  /create\s+or\s+replace\s+function\s+public\.registry_get_deployment_context/i.test(
    allSql,
  ) && /Brgy\. Bagongpook must have exactly seven active puroks/i.test(allSql),
  "Bagongpook deployment context requires exactly seven canonical puroks",
);
check(
  /new\.barangay_id\s*:=\s*selected_barangay_id/i.test(allSql) &&
    /apply_deployment_registry_locality/i.test(allSql),
  "Registry writes derive barangay_id from the selected database purok",
);
check(
  /barangay masigla \(fictional\)/i.test(allSql) &&
    /name = 'Brgy\. Bagongpook'/i.test(allSql) &&
    /city_or_municipality = 'Lipa City'/i.test(allSql) &&
    /province = 'Batangas'/i.test(allSql),
  "Legacy fictional barangay is reconciled to canonical Lipa City Bagongpook",
);
check(
  /barangay_count <> 1/i.test(allSql) &&
    /legacy_purok_count <> 8/i.test(allSql) &&
    /legacy_code_count <> 8/i.test(allSql) &&
    /expected single-barangay P01-P08 seed/i.test(allSql),
  "Legacy conversion rejects ambiguous or malformed fictional seed data",
);
check(
  /Legacy Barangay/i.test(allSql) &&
    /update public\.households[\s\S]*barangay_id = target_barangay_id/i.test(
      allSql,
    ) &&
    /update public\.residents[\s\S]*barangay_id = target_barangay_id/i.test(
      allSql,
    ),
  "Existing deployment and legacy registry references merge without deleting rows",
);
check(
  /is_active = canonical\.ordinal between 1 and 7/i.test(allSql) &&
    /p\.name = 'Purok 8'[\s\S]*not p\.is_active/i.test(allSql),
  "Reconciliation keeps exactly Purok 1 through 7 active and Purok 8 inactive",
);
check(
  /row_number\(\) over \(order by p\.barangay_id, p\.id\)/i.test(allSql) &&
    /'M' \|\| lpad\(ordered\.label_number::text, 19, '0'\)/i.test(allSql) &&
    /drop index public\.puroks_barangay_code_unique[\s\S]*create unique index puroks_barangay_code_unique/i.test(
      allSql,
    ) &&
    !/'M' \|\| left\(replace\(p\.id::text, '-', ''\), 19\)/i.test(allSql),
  "Temporary Bagongpook purok labels are ordered, unique, and code-valid",
);
check(
  /'resident-photos'[\s\S]*false[\s\S]*5242880/i.test(allSql) &&
    /resident_photos_select_authorized/i.test(allSql) &&
    /can_view_resident_photo/i.test(allSql),
  "Resident photos use a private five-megabyte RLS-protected bucket",
);
check(
  /registry_search_households/i.test(allSql) &&
    /security\s+invoker/i.test(allSql) &&
    /h\.archived_at is null/i.test(allSql) &&
    /from public\.registry_get_deployment_context\(\) as deployment_context/i.test(
      allSql,
    ) &&
    !/grant execute on function public\.deployment_barangay_id\(\)\s+to authenticated/i.test(
      allSql,
    ),
  "Household picker search is paginated, current-only, and RLS-preserving",
);
check(
  /registry_find_resident_duplicates/i.test(allSql) &&
    /resident\.duplicate_override/i.test(allSql),
  "Resident duplicate review and explicit override audit are installed",
);
check(
  /resident profile links require the trusted administrator workflow/i.test(
    allSql,
  ) &&
    /admin_link_resident_profile[\s\S]*to service_role/i.test(allSql) &&
    !/admin_link_resident_profile[^;]*to authenticated/i.test(allSql),
  "Resident profile linking is restricted to the trusted service-role workflow",
);
check(
  /registry_archive_sole_member_household[\s\S]*security definer[\s\S]*administrator\.role = 'admin'[\s\S]*administrator\.account_status = 'active'/i.test(
    allSql,
  ) &&
    /lock table public\.households, public\.residents[\s\S]*share row exclusive/i.test(
      allSql,
    ) &&
    /v_active_member_count <> 1[\s\S]*explicit replacement head/i.test(
      allSql,
    ) &&
    /head_resident_id = null[\s\S]*household_id = null[\s\S]*status = 'archived'/i.test(
      allSql,
    ),
  "Sole-member household archive is Administrator-only, serialized, and atomic",
);
check(
  /revoke insert, update on table public\.appointments from authenticated/i.test(
    allSql,
  ),
  "Direct authenticated appointment writes are retired",
);
check(
  /appointment_assert_slot_available[\s\S]*pg_advisory_xact_lock[\s\S]*a\.start_time < p_end_time[\s\S]*a\.end_time > p_start_time/i.test(
    allSql,
  ),
  "Appointment conflicts use serialized interval-overlap validation",
);
check(
  /add column version bigint not null default 1/i.test(allSql) &&
    /current_record\.version <> p_expected_version/i.test(allSql),
  "Appointment mutations use optimistic concurrency versions",
);
check(
  /appointments_request_key_unique/i.test(allSql) &&
    /appointments_single_replacement_unique/i.test(allSql),
  "Appointment creation and rescheduling have database idempotency guards",
);
check(
  /appointment_daily_queue[\s\S]*row_number\(\) over[\s\S]*status_group[\s\S]*priority_group/i.test(
    allSql,
  ),
  "Daily queue ordering is computed deterministically by the database",
);
check(
  /appointment\.created/i.test(allSql) &&
    /appointment\.checked_in/i.test(allSql) &&
    /appointment\.rescheduled/i.test(allSql) &&
    /audit_safe_snapshot\('appointments'/i.test(allSql),
  "Appointment lifecycle changes receive semantic data-minimized audits",
);
check(
  /current_profile_role\(\) = 'midwife'[\s\S]*service_type in \('Maternal Care', 'Child Health'\)/i.test(
    allSql,
  ),
  "Midwife appointment access remains limited to assigned maternal and child services",
);
const appointmentContractFix =
  migrationEntries.find(({ file }) =>
    file.includes("fix_appointment_rpc_contracts"),
  )?.sql ?? "";
check(
  /appointment_list[\s\S]*a\.service_type::text/i.test(
    appointmentContractFix,
  ) &&
    /appointment_daily_queue[\s\S]*q\.service_type::text/i.test(
      appointmentContractFix,
    ),
  "Appointment list and queue service types explicitly match their text contracts",
);
check(
  /appointment_calendar[\s\S]*a\.service_type::text/i.test(
    appointmentContractFix,
  ) &&
    /appointment_resident_history[\s\S]*a\.service_type::text/i.test(
      appointmentContractFix,
    ),
  "Calendar and resident-history service types use the same text contract",
);
check(
  /appointment_search_staff[\s\S]*p_service_type not in \(/i.test(
    appointmentContractFix,
  ) &&
    !/appointment_search_staff[\s\S]*appointment_service_type_valid\(p_service_type\)/i.test(
      appointmentContractFix,
    ),
  "Staff search validates its allowlist without calling the private helper",
);
check(
  /revoke all on function public\.appointment_service_type_valid\(text\)[\s\S]*from public, anon, authenticated/i.test(
    appointmentContractFix,
  ) &&
    !/grant execute on function public\.appointment_service_type_valid\(text\)[^;]*authenticated/i.test(
      appointmentContractFix,
    ),
  "The appointment service-type helper remains private",
);
check(
  !/grant\s+(?:select,\s*)?(?:insert|update)|grant\s+[^;]*(?:insert|update)[^;]*appointments/i.test(
    appointmentContractFix,
  ),
  "The RPC contract fix does not restore direct appointment mutation grants",
);

const residentAppointmentRequestsMigration =
  migrationEntries.find(({ file }) =>
    file.includes("resident_appointment_requests"),
  )?.sql ?? "";
const residentAppointmentDeclarationAudit = auditPlpgsqlIntoTargets(
  residentAppointmentRequestsMigration,
);
check(
  residentAppointmentDeclarationAudit.functionCount === 8 &&
    residentAppointmentDeclarationAudit.undeclared.length === 0,
  "Every resident-request PL/pgSQL INTO target is declared",
);
check(
  /resident_appointment_request[\s\S]*linked_profile_id = actor_id[\s\S]*resident_record\.status <> 'active'[\s\S]*resident_record\.archived_at is not null/i.test(
    residentAppointmentRequestsMigration,
  ) &&
    /'scheduled'::public\.appointment_type[\s\S]*'normal'::public\.appointment_priority[\s\S]*'pending'::public\.appointment_status/i.test(
      residentAppointmentRequestsMigration,
    ),
  "Resident appointment requests derive an active owner and force safe initial state",
);
check(
  /resident_appointment_request[\s\S]*pg_advisory_xact_lock[\s\S]*appointment request key was reused with different data[\s\S]*matching pending resident request already exists/i.test(
    residentAppointmentRequestsMigration,
  ),
  "Resident appointment requests serialize idempotency and duplicate protection",
);
check(
  /resident_appointment_cancel[\s\S]*appointment_record\.resident_id is distinct from resident_record\.id[\s\S]*only an own pending resident request can be cancelled/i.test(
    residentAppointmentRequestsMigration,
  ) &&
    /appointment_record\.version <> p_expected_version/i.test(
      residentAppointmentRequestsMigration,
    ),
  "Resident cancellation is own-pending-only and version protected",
);
const authorizedCancellationMigration =
  migrationEntries.find(({ file }) =>
    file.includes("optional_authorized_cancellation_reason"),
  )?.sql ?? "";
const authorizedCancellationDeclarationAudit = auditPlpgsqlIntoTargets(
  authorizedCancellationMigration,
);
check(
  authorizedCancellationDeclarationAudit.functionCount === 1 &&
    authorizedCancellationDeclarationAudit.undeclared.length === 0,
  "The authorized-cancellation transition has declared PL/pgSQL targets",
);
check(
  /appointments_cancelled_fields_consistent[\s\S]*status = 'cancelled' and cancelled_at is not null[\s\S]*status <> 'cancelled' and cancelled_at is null/i.test(
    authorizedCancellationMigration,
  ) &&
    !/appointments_cancelled_fields_consistent[\s\S]*cancellation_reason is not null/i.test(
      authorizedCancellationMigration,
    ),
  "Authorized cancellations may persist a SQL-null narrative",
);
check(
  /normalized_cancellation_reason text :=[\s\S]*nullif\(btrim\(p_cancellation_reason\), ''\)/i.test(
    authorizedCancellationMigration,
  ) &&
    /p_target_status = 'cancelled'[\s\S]*current_record\.status = 'pending'[\s\S]*current_record\.request_source =[\s\S]*'resident'[\s\S]*normalized_cancellation_reason is null[\s\S]*rejection reason is required/i.test(
      authorizedCancellationMigration,
    ),
  "Resident-request rejection remains distinct and justification-required",
);
check(
  /current_record\.version <> p_expected_version[\s\S]*errcode = '40001'/i.test(
    authorizedCancellationMigration,
  ) &&
    /select \* into current_record[\s\S]*for update/i.test(
      authorizedCancellationMigration,
    ) &&
    /actor_role = 'barangay_health_worker'[\s\S]*'cancelled'[\s\S]*current_record\.status <> 'in_progress'/i.test(
      authorizedCancellationMigration,
    ) &&
    /actor_role in \([\s\S]*'nurse'[\s\S]*'midwife'[\s\S]*'no_show'/i.test(
      authorizedCancellationMigration,
    ),
  "Cancellation authorization, row locking, and concurrency remain unchanged",
);
check(
  !/grant\s+(?:insert|update|delete)[^;]*public\.appointments/i.test(
    authorizedCancellationMigration,
  ) &&
    /grant execute on function public\.appointment_transition\([\s\S]*to authenticated, service_role/i.test(
      authorizedCancellationMigration,
    ),
  "The cancellation correction restores only the existing trusted RPC grant",
);
const simplifiedAppointmentCompletionMigration =
  migrationEntries.find(({ file }) =>
    file.includes("simplify_appointment_completion"),
  )?.sql ?? "";
const simplifiedCompletionDeclarationAudit = auditPlpgsqlIntoTargets(
  simplifiedAppointmentCompletionMigration,
);
check(
  simplifiedCompletionDeclarationAudit.functionCount === 1 &&
    simplifiedCompletionDeclarationAudit.undeclared.length === 0,
  "The simplified appointment transition has declared PL/pgSQL targets",
);
check(
  /\('checked_in'::public\.appointment_status, 'completed'::public\.appointment_status\)/i.test(
    simplifiedAppointmentCompletionMigration,
  ) &&
    /started_at = case[\s\S]*'in_progress'[\s\S]*'completed'[\s\S]*transitioned_at/i.test(
      simplifiedAppointmentCompletionMigration,
    ) &&
    /completed_at = case[\s\S]*'completed'[\s\S]*transitioned_at/i.test(
      simplifiedAppointmentCompletionMigration,
    ),
  "Checked-in appointments can complete with trusted server timestamps",
);
check(
  /current_record\.version <> p_expected_version[\s\S]*errcode = '40001'/i.test(
    simplifiedAppointmentCompletionMigration,
  ) &&
    /current_record\.assigned_staff_id = actor_id/i.test(
      simplifiedAppointmentCompletionMigration,
    ) &&
    !/health_encounters|health_record/i.test(
      simplifiedAppointmentCompletionMigration,
    ),
  "Simplified completion keeps concurrency and assignment checks without requiring a Health Record",
);
check(
  !/grant\s+(?:insert|update|delete)[^;]*public\.appointments/i.test(
    simplifiedAppointmentCompletionMigration,
  ) &&
    /grant execute on function public\.appointment_transition\([\s\S]*to authenticated, service_role/i.test(
      simplifiedAppointmentCompletionMigration,
    ),
  "Simplified completion restores only the existing trusted RPC grant",
);
check(
  /appointment_daily_queue[\s\S]*current_profile_role\(\) = 'resident'[\s\S]*residents cannot access the daily appointment queue/i.test(
    residentAppointmentRequestsMigration,
  ),
  "Residents are denied access to the operational daily queue",
);
check(
  /appointment\.resident_requested/i.test(
    residentAppointmentRequestsMigration,
  ) &&
    /appointment\.resident_cancelled/i.test(
      residentAppointmentRequestsMigration,
    ) &&
    /appointment\.request_confirmed/i.test(
      residentAppointmentRequestsMigration,
    ) &&
    /appointment\.request_schedule_adjusted/i.test(
      residentAppointmentRequestsMigration,
    ) &&
    /appointment\.request_rejected/i.test(
      residentAppointmentRequestsMigration,
    ) &&
    /appointment_request_events[\s\S]*enable row level security/i.test(
      residentAppointmentRequestsMigration,
    ),
  "Resident request audits and the private notification event boundary are installed",
);
check(
  !/grant\s+(?:insert|update)[^;]*public\.appointments/i.test(
    residentAppointmentRequestsMigration,
  ) &&
    /revoke all on table public\.appointment_request_events[\s\S]*authenticated/i.test(
      residentAppointmentRequestsMigration,
    ),
  "Resident request workflows do not restore direct writes or expose event rows",
);

const residentRequestDurationMigration =
  migrationEntries.find(({ file }) =>
    file.includes("simplify_resident_request_duration"),
  )?.sql ?? "";
const residentRequestDurationDeclarationAudit = auditPlpgsqlIntoTargets(
  residentRequestDurationMigration,
);
const refinedResidentRequest = residentRequestDurationMigration.slice(
  residentRequestDurationMigration.indexOf(
    "create or replace function public.resident_appointment_request(",
  ),
);
const refinedResidentRequestSignature = refinedResidentRequest.slice(
  0,
  refinedResidentRequest.indexOf(")"),
);
check(
  residentRequestDurationDeclarationAudit.functionCount === 1 &&
    residentRequestDurationDeclarationAudit.undeclared.length === 0,
  "The refined resident-request RPC has declared PL/pgSQL targets",
);
check(
  /resident_appointment_provisional_duration\(\)[\s\S]*select interval '30 minutes'/i.test(
    residentRequestDurationMigration,
  ) &&
    /revoke all on function public\.resident_appointment_provisional_duration\(\)[\s\S]*authenticated/i.test(
      residentRequestDurationMigration,
    ),
  "Resident provisional duration is centralized at a private database boundary",
);
check(
  /drop function public\.resident_appointment_request\(\s*text, date, time, time, text, uuid\s*\)/i.test(
    residentRequestDurationMigration,
  ) && !/p_end_time/i.test(refinedResidentRequestSignature),
  "The resident RPC retires browser-supplied end time",
);
check(
  /provisional_end_at\s*:=\s*p_scheduled_date \+ p_start_time \+ provisional_duration/i.test(
    refinedResidentRequest,
  ) &&
    /provisional_end_at::date is distinct from p_scheduled_date/i.test(
      refinedResidentRequest,
    ) &&
    /appointment_validate_schedule\([\s\S]*p_start_time,\s*provisional_end_time/i.test(
      refinedResidentRequest,
    ),
  "Derived resident request ranges stay on-date and use trusted schedule validation",
);
check(
  /existing_record\.end_time is distinct from provisional_end_time/i.test(
    refinedResidentRequest,
  ) &&
    /pg_advisory_xact_lock/i.test(refinedResidentRequest) &&
    /matching pending resident request already exists/i.test(
      refinedResidentRequest,
    ),
  "Derived duration preserves resident request idempotency and duplicate protection",
);

const healthRecordsMigration =
  migrationEntries.find(({ file }) =>
    file.includes("health_records_foundation"),
  )?.sql ?? "";
const healthRecordsDeclarationAudit = auditPlpgsqlIntoTargets(
  healthRecordsMigration,
);
check(
  healthRecordsDeclarationAudit.functionCount === 19 &&
    healthRecordsDeclarationAudit.undeclared.length === 0 &&
    /create or replace function public\.health_encounter_create[\s\S]*?declare[\s\S]*?existing_record public\.health_encounters%rowtype;[\s\S]*?begin/i.test(
      healthRecordsMigration,
    ),
  "Every Migration 20 PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /nextval\('public\.health_encounter_number_seq'\)/i.test(
    healthRecordsMigration,
  ) &&
    /encounter_number is database-generated and immutable/i.test(
      healthRecordsMigration,
    ),
  "Encounter numbers are atomic and immutable",
);
check(
  /health_encounters_appointment_unique/i.test(healthRecordsMigration) &&
    /for update[\s\S]*appointment and encounter resident do not match/i.test(
      healthRecordsMigration,
    ) &&
    /request_key/i.test(healthRecordsMigration) &&
    /pg_advisory_xact_lock/i.test(healthRecordsMigration) &&
    /encounter request key was reused with different data/i.test(
      healthRecordsMigration,
    ),
  "Appointment encounter creation is transactional, resident-consistent, and idempotent",
);
check(
  /current_record\.version <> p_expected_version/i.test(
    healthRecordsMigration,
  ) &&
    /signed health encounters are immutable/i.test(healthRecordsMigration) &&
    /health_encounter_amend/i.test(healthRecordsMigration),
  "Clinical edits use optimistic concurrency, signed immutability, and amendments",
);
const residentEncounterPolicy = healthRecordsMigration.slice(
  healthRecordsMigration.indexOf(
    "create policy health_encounters_select_resident_signed",
  ),
  healthRecordsMigration.indexOf("create policy vital_signs_select_clinical"),
);
check(
  /status in \([\s\S]*'signed'[\s\S]*'amended'/i.test(
    residentEncounterPolicy,
  ) && !/'draft'/i.test(residentEncounterPolicy),
  "Residents can read only their own signed or amended encounters",
);
check(
  /revoke all on table public\.health_encounters from public, anon, authenticated/i.test(
    healthRecordsMigration,
  ) &&
    /grant select on table public\.health_encounters to authenticated/i.test(
      healthRecordsMigration,
    ) &&
    !/grant (?:insert|update)[^;]*health_encounters[^;]*authenticated/i.test(
      healthRecordsMigration,
    ),
  "Clinical table mutations are unavailable to browser roles",
);
check(
  !/create policy health_encounters_select_(?:admin|bhw)/i.test(
    healthRecordsMigration,
  ) &&
    /clinical narrative restricted/i.test(
      fs.readFileSync(
        path.join(
          root,
          "src",
          "features",
          "health-records",
          "HealthRecordDetailPage.jsx",
        ),
        "utf8",
      ),
    ),
  "Administrators and BHWs have no direct narrative-table policy",
);
const vitalSignsTable = healthRecordsMigration.slice(
  healthRecordsMigration.indexOf("create table public.vital_signs"),
  healthRecordsMigration.indexOf("create table public.resident_allergies"),
);
check(
  /create table public\.vital_signs/i.test(vitalSignsTable) &&
    !/\bbmi\s+(?:numeric|decimal|real|double)/i.test(vitalSignsTable) &&
    /v\.weight_kg \/ power\(v\.height_cm \/ 100, 2\)/i.test(
      healthRecordsMigration,
    ),
  "BMI is calculated consistently and is not a writable stored field",
);
const clinicalAudit = healthRecordsMigration.slice(
  healthRecordsMigration.indexOf(
    "create or replace function public.audit_clinical_change",
  ),
  healthRecordsMigration.indexOf(
    "revoke all on function public.health_record_list",
  ),
);
check(
  /encounter\.created/i.test(clinicalAudit) &&
    /encounter\.signed/i.test(clinicalAudit) &&
    /vital_signs\.updated/i.test(clinicalAudit) &&
    /allergy\.archived/i.test(clinicalAudit) &&
    /medical_history\.archived/i.test(clinicalAudit) &&
    !/new\.(?:chief_complaint|subjective_notes|objective_notes|assessment|plan|diagnosis_text|treatment_notes|allergen|reaction|condition_name|details)/i.test(
      clinicalAudit,
    ),
  "Clinical audits are semantic and exclude narrative values",
);
check(
  /health_record_list[\s\S]*returns table[\s\S]*total_count bigint/i.test(
    healthRecordsMigration,
  ) &&
    /p_limit integer default 20/i.test(healthRecordsMigration) &&
    /p_offset integer default 0/i.test(healthRecordsMigration),
  "Health-record search and filters are server-paginated",
);

const clinicalManilaDatesMigration =
  migrationEntries.find(({ file }) =>
    file.includes("fix_clinical_manila_dates"),
  )?.sql ?? "";
check(
  /drop constraint health_encounters_date_valid/i.test(
    clinicalManilaDatesMigration,
  ) &&
    /encounter_date\s*<=\s*\(pg_catalog\.now\(\)\s+at time zone 'Asia\/Manila'\)::date/i.test(
      clinicalManilaDatesMigration,
    ) &&
    /onset_date\s+is null[\s\S]*onset_date\s*<=\s*\(pg_catalog\.now\(\)\s+at time zone 'Asia\/Manila'\)::date/i.test(
      clinicalManilaDatesMigration,
    ),
  "Clinical date constraints use the explicit Manila business date",
);
check(
  (
    clinicalManilaDatesMigration.match(
      /manila_today date\s*:=\s*\(pg_catalog\.now\(\)\s+at time zone 'Asia\/Manila'\)::date/gi,
    ) ?? []
  ).length === 3 &&
    !/\bcurrent_date\b/i.test(clinicalManilaDatesMigration) &&
    !/current_setting\s*\(\s*'TimeZone'/i.test(clinicalManilaDatesMigration),
  "Clinical RPC date rules are deterministic and session-timezone independent",
);
check(
  /health_encounters_follow_up_valid check \([\s\S]*follow_up_date >= encounter_date/i.test(
    healthRecordsMigration,
  ) &&
    /recorded_at timestamptz not null default now\(\)/i.test(
      healthRecordsMigration,
    ) &&
    /noted_at timestamptz not null default now\(\)/i.test(
      healthRecordsMigration,
    ),
  "Relative follow-up validation and UTC clinical event timestamps remain intact",
);

const maternalChildMigration =
  migrationEntries.find(({ file }) => file.includes("maternal_child_care"))
    ?.sql ?? "";
const maternalChildTriggerFixMigration =
  migrationEntries.find(({ file }) =>
    file.includes("fix_maternal_child_trigger_columns"),
  )?.sql ?? "";
const maternalChildDeclarationAudit = auditPlpgsqlIntoTargets(
  maternalChildMigration,
);
check(
  maternalChildDeclarationAudit.functionCount === 15 &&
    maternalChildDeclarationAudit.undeclared.length === 0,
  "Every maternal-child PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /nextval\('public\.maternal_pregnancy_number_seq'\)/i.test(
    maternalChildMigration,
  ) &&
    /nextval\('public\.child_health_profile_number_seq'\)/i.test(
      maternalChildMigration,
    ) &&
    !/select\s+max\s*\(/i.test(maternalChildMigration),
  "Maternal and child identifiers use atomic sequences",
);
check(
  /maternal_one_active_pregnancy/i.test(maternalChildMigration) &&
    /child_one_active_profile/i.test(maternalChildMigration) &&
    /request_key/i.test(maternalChildMigration) &&
    /version bigint not null default 1/i.test(maternalChildMigration),
  "Maternal and child creation is duplicate-safe, idempotent, and versioned",
);
check(
  /create table public\.child_immunizations[\s\S]*?\n\s+request_key uuid,[\s\S]*?create unique index child_immunization_request_unique[\s\S]*?\(recorded_by,\s*request_key\)[\s\S]*?where request_key is not null/i.test(
    maternalChildMigration,
  ) &&
    /where i\.recorded_by=actor_id and i\.request_key=p_request_key[\s\S]*?insert into public\.child_immunizations\([\s\S]*?recorded_by,request_key[\s\S]*?actor_id,p_request_key/i.test(
      maternalChildMigration,
    ),
  "Child immunization request keys are nullable storage values enforced and reused by the trusted create RPC",
);
check(
  /r\.linked_profile_id=auth\.uid\(\)/i.test(maternalChildMigration) &&
    !/\br\.profile_id\b/i.test(maternalChildMigration),
  "Maternal-child resident ownership uses the deployed linked_profile_id column",
);
check(
  /revoke all on table public\.maternal_pregnancies[\s\S]*authenticated/i.test(
    maternalChildMigration,
  ) &&
    !/grant\s+(?:insert|update|delete)[^;]*maternal_pregnancies[^;]*authenticated/i.test(
      maternalChildMigration,
    ) &&
    !/using\s*\(\s*true\s*\)/i.test(maternalChildMigration),
  "Maternal and child records have no browser write grants or broad RLS policies",
);
check(
  /when 'resident' then p\.resident_id = public\.current_resident_id\(\)/i.test(
    maternalChildMigration,
  ) &&
    /when 'resident' then c\.child_resident_id=public\.current_resident_id\(\)/i.test(
      maternalChildMigration,
    ) &&
    /actor_role='resident' and resident_id<>public\.current_resident_id\(\)/i.test(
      maternalChildMigration,
    ),
  "Resident access is limited to the resident's own linked record",
);
check(
  /nurse maternal documentation requires an assigned appointment or encounter/i.test(
    maternalChildMigration,
  ) &&
    /BHW growth recording requires a checked-in child appointment/i.test(
      maternalChildMigration,
    ) &&
    /child profile management requires a midwife/i.test(maternalChildMigration),
  "Clinical mutation RPCs enforce midwife, assignment-scoped nurse, and BHW measurement boundaries",
);
check(
  /at time zone 'Asia\/Manila'/i.test(maternalChildMigration) &&
    /last menstrual period cannot be in the future/i.test(
      maternalChildMigration,
    ) &&
    /immunization date cannot be in the future/i.test(maternalChildMigration),
  "Maternal and child date-only rules use the Manila business date",
);
check(
  /maternal\.pregnancy_created/i.test(maternalChildMigration) &&
    /child\.growth_recorded/i.test(maternalChildMigration) &&
    /changed_fields/i.test(maternalChildMigration) &&
    !/new\.(?:risk_notes|findings|plan|developmental_notes|notes)/i.test(
      maternalChildMigration.slice(
        maternalChildMigration.indexOf(
          "create or replace function public.audit_maternal_child_change",
        ),
        maternalChildMigration.indexOf(
          "create or replace function public.maternal_pregnancy_list",
        ),
      ),
    ),
  "Maternal and child audits are semantic and exclude clinical narrative values",
);
check(
  /create function public\.set_maternal_pregnancy_number\(\)[\s\S]*new\.pregnancy_number[\s\S]*pregnancy_number is database-generated and immutable/i.test(
    maternalChildTriggerFixMigration,
  ) &&
    /create function public\.set_child_health_profile_number\(\)[\s\S]*new\.child_number[\s\S]*child_number is database-generated and immutable/i.test(
      maternalChildTriggerFixMigration,
    ) &&
    !/set_maternal_pregnancy_number\(\)[\s\S]*?\$\$;[\s\S]*?\bchild_number\b/i.test(
      maternalChildTriggerFixMigration.slice(
        maternalChildTriggerFixMigration.indexOf(
          "create function public.set_maternal_pregnancy_number",
        ),
        maternalChildTriggerFixMigration.indexOf(
          "create function public.set_child_health_profile_number",
        ),
      ),
    ),
  "Maternal and child immutable numbers use table-specific trigger functions",
);
check(
  /new_row := to_jsonb\(new\)/i.test(maternalChildTriggerFixMigration) &&
    /to_jsonb\(old\)/i.test(maternalChildTriggerFixMigration) &&
    /new_row ->> 'pregnancy_number'/i.test(maternalChildTriggerFixMigration) &&
    /new_row ->> 'child_number'/i.test(maternalChildTriggerFixMigration) &&
    !/\b(?:new|old)\.(?:pregnancy_number|child_number|status|archived_at)\b/i.test(
      maternalChildTriggerFixMigration.slice(
        maternalChildTriggerFixMigration.indexOf(
          "create or replace function public.audit_maternal_child_change",
        ),
      ),
    ),
  "Shared maternal-child auditing uses row-type-safe JSONB field access",
);

const reportsMigration =
  migrationEntries.find(({ file }) => file.includes("reports_analytics"))
    ?.sql ?? "";
check(
  /report_validate_scope[\s\S]*actor_role is null or actor_role = 'resident'/i.test(
    reportsMigration,
  ) &&
    /revoke all on function public\.report_[\s\S]*from public, anon, authenticated/i.test(
      reportsMigration,
    ),
  "Reports deny resident and anonymous access at the database boundary",
);
check(
  /report_registry_summary[\s\S]*?security invoker/i.test(reportsMigration) &&
    /report_appointment_summary[\s\S]*?security invoker/i.test(
      reportsMigration,
    ) &&
    /report_overview_summary[\s\S]*?security definer[\s\S]*?report_validate_scope/i.test(
      reportsMigration,
    ) &&
    /report_health_summary[\s\S]*?security definer[\s\S]*?report_validate_scope/i.test(
      reportsMigration,
    ) &&
    /report_maternal_summary[\s\S]*?security definer[\s\S]*?report_validate_scope/i.test(
      reportsMigration,
    ) &&
    !/security definer[\s\S]*returns table\([\s\S]*resident_name/i.test(
      reportsMigration,
    ),
  "Report RPCs retain RLS or use authorized aggregate-only definers",
);
check(
  /current_timestamp at time zone 'Asia\/Manila'/i.test(reportsMigration) &&
    /between p_start_date and p_end_date/i.test(reportsMigration) &&
    /report date range cannot exceed five years/i.test(reportsMigration),
  "Reports use inclusive, bounded Manila-aware date filtering",
);
check(
  /p_limit < 1 or p_limit > 5000/i.test(reportsMigration) &&
    /report\.large_export_requested/i.test(reportsMigration) &&
    /filter_fields[\s\S]*row_count/i.test(reportsMigration),
  "Exports are capped and audited with minimized metadata",
);
check(
  !/\b(?:chief_complaint|subjective_notes|objective_notes|assessment|diagnosis_text|treatment_notes|risk_notes|developmental_notes)\b/i.test(
    reportsMigration,
  ),
  "Report functions do not select clinical narratives",
);
check(
  /with days\(period_date\) as \([\s\S]*pg_catalog\.generate_series\([\s\S]*\) as generated\(generated_at\)/i.test(
    reportsMigration,
  ) &&
    /group by days\.period_date[\s\S]*order by days\.period_date/i.test(
      reportsMigration,
    ) &&
    !/::date\s+day\b/i.test(reportsMigration),
  "Report date series uses explicit, parser-safe aliases",
);
check(
  !/\)\s+rows\b/i.test(reportsMigration) &&
    !/\bgroups\s*\(/i.test(reportsMigration) &&
    /with ordinality as export_element\(value, position\)/i.test(
      reportsMigration,
    ),
  "Report derived tables and ordinality use unambiguous aliases",
);

const assistanceMigration =
  migrationEntries.find(({ file }) => file.includes("general_assistance"))
    ?.sql ?? "";
const assistanceDeclarationAudit = auditPlpgsqlIntoTargets(assistanceMigration);
check(
  assistanceDeclarationAudit.functionCount === 21 &&
    assistanceDeclarationAudit.undeclared.length === 0,
  "Every general-assistance PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /revoke all on table public\.announcements,[\s\S]*resident_inquiries from public, anon, authenticated/i.test(
    assistanceMigration,
  ) &&
    !/grant\s+(?:select|insert|update|delete)[^;]*public\.(?:announcements|assistance_notifications|health_center_information|faq_entries|resident_inquiries)[^;]*authenticated/i.test(
      assistanceMigration,
    ),
  "General-assistance tables are RLS-enabled RPC-only boundaries",
);
check(
  /a\.publish_at <= now\(\)[\s\S]*a\.expires_at is null or a\.expires_at > now\(\)/i.test(
    assistanceMigration,
  ) &&
    /order by a\.is_pinned desc,a\.publish_at desc,a\.id/i.test(
      assistanceMigration,
    ),
  "Announcement visibility enforces publication, expiry, and pinned ordering",
);
check(
  /n\.recipient_profile_id=auth\.uid\(\)/i.test(assistanceMigration) &&
    /r\.linked_profile_id=auth\.uid\(\)[\s\S]*a\.entity_type='appointments'/i.test(
      assistanceMigration,
    ) &&
    !/\b(?:chief_complaint|subjective_notes|objective_notes|assessment|diagnosis_text|treatment_notes|risk_notes|developmental_notes)\b/i.test(
      assistanceMigration,
    ),
  "Notifications and resident activity are owner-scoped and narrative-free",
);
check(
  /create trigger appointments_assistance_notifications/i.test(
    assistanceMigration,
  ) &&
    /create trigger health_encounters_assistance_notifications/i.test(
      assistanceMigration,
    ) &&
    /maternal_pregnancies[\s\S]*child_health_visits[\s\S]*assistance_notify_maternal_child/i.test(
      assistanceMigration,
    ),
  "Trusted appointment, health, maternal, and child events create in-app notifications",
);
check(
  /linked_profile_id=auth\.uid\(\)[\s\S]*status='active'[\s\S]*archived_at is null/i.test(
    assistanceMigration,
  ) &&
    /actor_role in \('admin','barangay_health_worker'\)[\s\S]*or i\.resident_profile_id=auth\.uid\(\)/i.test(
      assistanceMigration,
    ) &&
    /closed inquiry cannot be changed/i.test(assistanceMigration),
  "Inquiry creation derives the linked resident owner and uses a bounded staff workflow",
);
check(
  /announcement\.created/i.test(assistanceMigration) &&
    /announcement\.updated/i.test(assistanceMigration) &&
    /announcement\.archived/i.test(assistanceMigration) &&
    /announcement\.pinned/i.test(assistanceMigration) &&
    /notification\.read_all/i.test(assistanceMigration) &&
    /inquiry\.status_changed/i.test(assistanceMigration),
  "Required assistance actions produce minimized semantic audits",
);

const archivedAnnouncementNotificationMigration =
  migrationEntries.find(({ file }) =>
    file.includes("cleanup_archived_announcement_notifications"),
  )?.sql ?? "";
const archivedAnnouncementNotificationDeclarationAudit =
  auditPlpgsqlIntoTargets(archivedAnnouncementNotificationMigration);
check(
  archivedAnnouncementNotificationDeclarationAudit.functionCount === 1 &&
    archivedAnnouncementNotificationDeclarationAudit.undeclared.length === 0,
  "Archived-announcement notification cleanup has declared PL/pgSQL targets",
);
check(
  /delete from public\.assistance_notifications as notification\s+using public\.announcements as announcement[\s\S]*notification\.source_type = 'announcements'[\s\S]*notification\.source_id = announcement\.id[\s\S]*announcement\.archived_at is not null/i.test(
    archivedAnnouncementNotificationMigration,
  ) &&
    /delete from public\.assistance_notifications as notification[\s\S]*notification\.source_type = 'announcements'[\s\S]*notification\.source_id = p_id/i.test(
      archivedAnnouncementNotificationMigration,
    ) &&
    !/(?:title|summary|dedup_key)\s*(?:=|like|ilike)/i.test(
      archivedAnnouncementNotificationMigration,
    ),
  "Archived announcements remove only source-linked in-app notifications",
);
check(
  /assistance_require_role\([\s\S]*array\['admin','barangay_health_worker'\]/i.test(
    archivedAnnouncementNotificationMigration,
  ) &&
    /where id = p_id\s+for update/i.test(
      archivedAnnouncementNotificationMigration,
    ) &&
    /current_record\.version <> p_expected_version/i.test(
      archivedAnnouncementNotificationMigration,
    ) &&
    /'announcement\.archived'[\s\S]*'announcements'[\s\S]*p_id/i.test(
      archivedAnnouncementNotificationMigration,
    ) &&
    !/delete from public\.(?:announcements|audit_logs)/i.test(
      archivedAnnouncementNotificationMigration,
    ),
  "Announcement cleanup preserves soft deletion, authorization, concurrency, and audit history",
);
check(
  /revoke all on function public\.announcement_archive\(uuid, bigint\)[\s\S]*from public, anon, authenticated/i.test(
    archivedAnnouncementNotificationMigration,
  ) &&
    /grant execute on function public\.announcement_archive\(uuid, bigint\)[\s\S]*to authenticated, service_role/i.test(
      archivedAnnouncementNotificationMigration,
    ) &&
    !/grant\s+delete\s+on\s+(?:table\s+)?public\.assistance_notifications/i.test(
      archivedAnnouncementNotificationMigration,
    ),
  "Announcement cleanup restores only the existing trusted RPC grant",
);

const finalQaMigration =
  migrationEntries.find(({ file }) => file.includes("final_qa_fixes"))?.sql ??
  "";
const finalQaDeclarationAudit = auditPlpgsqlIntoTargets(finalQaMigration);
check(
  finalQaDeclarationAudit.functionCount === 2 &&
    finalQaDeclarationAudit.undeclared.length === 0,
  "Every final-QA PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /drop constraint assistance_notification_path_safe/i.test(finalQaMigration) &&
    /char_length\(action_path\) between 2 and 301/i.test(finalQaMigration) &&
    finalQaMigration.includes("action_path ~ '^/[a-z0-9_/?=&-]+$'"),
  "Notification paths avoid unsupported PostgreSQL repetition bounds",
);
check(
  /protect_appointment_request_metadata[\s\S]*new\.request_source is distinct from old\.request_source/i.test(
    finalQaMigration,
  ) &&
    /new\.requested_date is distinct from old\.requested_date[\s\S]*new\.requested_start_time is distinct from old\.requested_start_time[\s\S]*new\.requested_end_time is distinct from old\.requested_end_time/i.test(
      finalQaMigration,
    ) &&
    /scheduled_date = p_scheduled_date[\s\S]*start_time = p_start_time[\s\S]*end_time = p_end_time/i.test(
      allSql,
    ),
  "Resident preferences remain immutable while current schedules stay staff-managed",
);
check(
  /health_vital_signs_save[\s\S]*v_encounter_record public\.health_encounters%rowtype/i.test(
    finalQaMigration,
  ) &&
    /select e\.\* into v_encounter_record/i.test(finalQaMigration) &&
    /on conflict on constraint vital_signs_encounter_unique do update/i.test(
      finalQaMigration,
    ) &&
    !/on conflict \(encounter_id\)/i.test(finalQaMigration),
  "Vital-sign upserts avoid PL/pgSQL output-column ambiguity",
);
const finalQaAuditFields = finalQaMigration.slice(
  finalQaMigration.indexOf("function public.appointment_changed_fields"),
  finalQaMigration.indexOf(
    "revoke all on function public.appointment_changed_fields",
  ),
);
check(
  finalQaAuditFields.length > 0 &&
    !/cancellation_reason|operational_notes|['"]reason['"]/i.test(
      finalQaAuditFields,
    ),
  "Cancellation reasons remain excluded from appointment audit metadata",
);
check(
  !/grant\s+(?:select|insert|update|delete)[^;]*authenticated/i.test(
    finalQaMigration,
  ) && !/grant execute[^;]*authenticated/i.test(finalQaMigration),
  "Final QA fixes do not broaden browser database privileges",
);

const aiRateLimitMigration =
  migrationEntries.find(({ file }) => file.includes("ai_assistant_rate_limit"))
    ?.sql ?? "";
const aiRateLimitDeclarationAudit =
  auditPlpgsqlIntoTargets(aiRateLimitMigration);
check(
  aiRateLimitDeclarationAudit.functionCount === 1 &&
    aiRateLimitDeclarationAudit.undeclared.length === 0,
  "Every AI rate-limit PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /create table public\.ai_request_rate_limits/i.test(aiRateLimitMigration) &&
    /alter table public\.ai_request_rate_limits enable row level security/i.test(
      aiRateLimitMigration,
    ) &&
    /revoke all on table public\.ai_request_rate_limits[\s\S]*public, anon, authenticated/i.test(
      aiRateLimitMigration,
    ) &&
    !/create policy/i.test(aiRateLimitMigration),
  "AI request counters are an RLS-enabled service-only boundary",
);
check(
  /on conflict \(profile_id\) do update/i.test(aiRateLimitMigration) &&
    /returning rate_limit\.request_count into v_request_count/i.test(
      aiRateLimitMigration,
    ) &&
    /least\(rate_limit\.request_count \+ 1, p_max_requests \+ 1\)/i.test(
      aiRateLimitMigration,
    ) &&
    /p_max_requests is null/i.test(aiRateLimitMigration) &&
    /p_max_requests not between 1 and 100/i.test(aiRateLimitMigration) &&
    /account_status = 'active'/i.test(aiRateLimitMigration) &&
    /grant execute on function public\.consume_ai_request_rate_limit\(uuid, integer\)[\s\S]*to service_role/i.test(
      aiRateLimitMigration,
    ) &&
    !/grant execute[^;]*authenticated/i.test(aiRateLimitMigration),
  "AI rate limiting is atomic, active-profile-bound, and service-role-only",
);
check(
  /extract\(\s*epoch from \(/i.test(aiRateLimitMigration) &&
    !/pg_catalog\.(?:extract|greatest|least)\s*\(/i.test(
      aiRateLimitMigration,
    ) &&
    /greatest\(p_max_requests - v_request_count, 0\)/i.test(
      aiRateLimitMigration,
    ) &&
    /when v_request_count <= p_max_requests then 0[\s\S]*else greatest\([\s\S]*1,[\s\S]*pg_catalog\.ceil\([\s\S]*extract\([\s\S]*epoch from[\s\S]*v_window_started_at \+ interval '1 hour'[\s\S]*pg_catalog\.statement_timestamp\(\)[\s\S]*\)::integer/i.test(
      aiRateLimitMigration,
    ),
  "AI retry timing uses parser-safe UTC-hour arithmetic and bounded integers",
);
const aiRateLimitTable = aiRateLimitMigration.slice(
  aiRateLimitMigration.indexOf("create table public.ai_request_rate_limits"),
  aiRateLimitMigration.indexOf("alter table public.ai_request_rate_limits"),
);
check(
  aiRateLimitTable.length > 0 &&
    !/message|prompt|response|content|diagnos|clinical/i.test(aiRateLimitTable),
  "AI rate limiting stores no prompt, response, or clinical content",
);

const aiGroundingMigration =
  migrationEntries.find(({ file }) => file.includes("ai_grounding_context"))
    ?.sql ?? "";
const aiGroundingDeclarationAudit =
  auditPlpgsqlIntoTargets(aiGroundingMigration);
check(
  aiGroundingDeclarationAudit.functionCount === 1 &&
    aiGroundingDeclarationAudit.undeclared.length === 0,
  "Every AI grounding PL/pgSQL SELECT INTO target is declared",
);
const aiGroundingFunction = aiGroundingMigration.slice(
  aiGroundingMigration.indexOf("create or replace function"),
  aiGroundingMigration.indexOf("revoke all on function"),
);
check(
  /from public\.faq_entries as faq/i.test(aiGroundingFunction) &&
    /from public\.health_center_information as info/i.test(
      aiGroundingFunction,
    ) &&
    /from public\.announcements as announcement/i.test(aiGroundingFunction) &&
    !/from public\.(?:residents|appointments|health_encounters|vital_signs|maternal_|child_|audit_logs|resident_inquiries)/i.test(
      aiGroundingFunction,
    ),
  "AI grounding reads only approved low-risk assistance sources",
);
check(
  /faq\.archived_at is null/i.test(aiGroundingFunction) &&
    /announcement\.archived_at is null/i.test(aiGroundingFunction) &&
    /announcement\.publish_at <= pg_catalog\.statement_timestamp\(\)/i.test(
      aiGroundingFunction,
    ) &&
    /announcement\.expires_at > pg_catalog\.statement_timestamp\(\)/i.test(
      aiGroundingFunction,
    ),
  "AI grounding excludes archived, future, and expired source rows",
);
check(
  /cardinality\(p_source_types\) not between 1 and 3/i.test(
    aiGroundingFunction,
  ) &&
    /p_per_source_limit not between 1 and 8/i.test(aiGroundingFunction) &&
    /where grounding\.source_rank <= p_per_source_limit/i.test(
      aiGroundingFunction,
    ) &&
    /left\(btrim\(faq\.answer\), 2000\)/i.test(aiGroundingFunction) &&
    /left\(btrim\(announcement\.content\), 1600\)/i.test(aiGroundingFunction),
  "AI grounding source types, row counts, and text sizes are bounded",
);
check(
  /profile\.account_status = 'active'/i.test(aiGroundingFunction) &&
    /active supported profile required for AI grounding/i.test(
      aiGroundingFunction,
    ) &&
    /revoke all on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*public, anon, authenticated/i.test(
      aiGroundingMigration,
    ) &&
    /grant execute on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*to service_role/i.test(
      aiGroundingMigration,
    ) &&
    !/grant execute[^;]*authenticated/i.test(aiGroundingMigration),
  "AI grounding is active-profile-bound and service-role-only",
);
check(
  !/\b(?:insert\s+into|update\s+public|delete\s+from|execute\s+format|nextval)\b/i.test(
    aiGroundingFunction,
  ) &&
    !/created_by|updated_by|contact_number|email|emergency_contacts|doctors|nurses|midwives|bhws/i.test(
      aiGroundingFunction,
    ),
  "AI grounding is read-only and excludes author, contact, and staff fields",
);

const printableDocumentsMigration =
  migrationEntries.find(({ file }) =>
    file.includes("printable_healthcare_documents"),
  )?.sql ?? "";
const printableDocumentsDeclarationAudit = auditPlpgsqlIntoTargets(
  printableDocumentsMigration,
);
check(
  printableDocumentsDeclarationAudit.functionCount === 12 &&
    printableDocumentsDeclarationAudit.undeclared.length === 0,
  "Every printable-document PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /create\s+table\s+public\.clinical_referrals/i.test(
    printableDocumentsMigration,
  ) &&
    /alter\s+table\s+public\.clinical_referrals\s+enable\s+row\s+level\s+security/i.test(
      printableDocumentsMigration,
    ) &&
    /revoke\s+all\s+on\s+table\s+public\.clinical_referrals\s+from\s+public,\s*anon,\s*authenticated/i.test(
      printableDocumentsMigration,
    ) &&
    !/create\s+policy[^;]*on\s+public\.clinical_referrals/i.test(
      printableDocumentsMigration,
    ),
  "Clinical referrals are RLS-enabled and RPC-only for browser roles",
);
check(
  /nextval\('public\.referral_number_seq'\)/i.test(
    printableDocumentsMigration,
  ) &&
    /clinical_referrals_request_unique/i.test(printableDocumentsMigration) &&
    /pg_advisory_xact_lock/i.test(printableDocumentsMigration) &&
    /request key was reused with different data/i.test(
      printableDocumentsMigration,
    ) &&
    /referral_record\.version is distinct from p_expected_version/i.test(
      printableDocumentsMigration,
    ),
  "Referral creation is atomic, idempotent, and optimistic-version protected",
);
check(
  /finalized referrals are immutable/i.test(printableDocumentsMigration) &&
    /status = 'finalized'::public\.referral_status[\s\S]*finalized_at = statement_timestamp\(\)/i.test(
      printableDocumentsMigration,
    ) &&
    /only the referring clinician can archive a finalized referral/i.test(
      printableDocumentsMigration,
    ),
  "Finalized referrals are immutable and use controlled clinician archival",
);
check(
  /encounter_record\.attending_staff_id is distinct from actor_id/i.test(
    printableDocumentsMigration,
  ) &&
    !/referral_save\([\s\S]*?p_resident_id/i.test(
      printableDocumentsMigration,
    ) &&
    /encounter_record\.status not in \([\s\S]*?'signed'[\s\S]*?'amended'/i.test(
      printableDocumentsMigration,
    ),
  "Referral authorship derives resident and clinical scope from a signed encounter",
);
check(
  /document_appointment_slip[\s\S]*appointment_record\.status not in \([\s\S]*?'confirmed'[\s\S]*?'completed'/i.test(
    printableDocumentsMigration,
  ) &&
    /document_appointment_slip[\s\S]*public\.current_resident_id\(\)/i.test(
      printableDocumentsMigration,
    ) &&
    !/document_appointment_slip[\s\S]*?'operational_notes'/i.test(
      printableDocumentsMigration,
    ),
  "Appointment slips enforce valid state and ownership without operational notes",
);
check(
  /document_consultation_summary[\s\S]*encounter_record\.status not in \([\s\S]*?'signed'[\s\S]*?'amended'/i.test(
    printableDocumentsMigration,
  ) &&
    /document_consultation_summary[\s\S]*actor_role <> 'nurse'/i.test(
      printableDocumentsMigration,
    ) &&
    !/document_consultation_summary[\s\S]*?'subjective_notes'/i.test(
      printableDocumentsMigration,
    ),
  "Consultation summaries are final-record-only and preserve clinical masking",
);
check(
  /document_prenatal_summary[\s\S]*limit 50/i.test(
    printableDocumentsMigration,
  ) &&
    /document_child_health_summary[\s\S]*limit 12[\s\S]*limit 100/i.test(
      printableDocumentsMigration,
    ) &&
    !/document_(?:prenatal|child_health)_summary[\s\S]*?'(?:risk_notes|findings|developmental_notes|notes)'/i.test(
      printableDocumentsMigration,
    ),
  "Maternal and child documents return bounded facts without narratives or interpretation",
);
const referralAuditFunction = printableDocumentsMigration.slice(
  printableDocumentsMigration.indexOf(
    "create or replace function public.audit_clinical_referral_change",
  ),
  printableDocumentsMigration.indexOf(
    "create trigger clinical_referrals_set_number",
  ),
);
check(
  /referral\.(?:created|updated|finalized|archived)/i.test(
    referralAuditFunction,
  ) &&
    !/receiving_facility|reason_for_referral|clinical_summary/i.test(
      referralAuditFunction,
    ),
  "Referral audits are semantic and exclude document narratives",
);
check(
  /grant\s+execute\s+on\s+function[\s\S]*document_appointment_slip[\s\S]*to\s+authenticated,\s*service_role/i.test(
    printableDocumentsMigration,
  ) &&
    !/grant\s+(?:select|insert|update|delete)[^;]*clinical_referrals[^;]*authenticated/i.test(
      printableDocumentsMigration,
    ),
  "Printable-document RPC grants do not restore direct clinical table access",
);

const notificationMigration =
  migrationEntries.find(({ file }) =>
    file.includes("outbound_notification_foundation"),
  )?.sql ?? "";
const notificationDeclarationAudit = auditPlpgsqlIntoTargets(
  notificationMigration,
);
check(
  notificationDeclarationAudit.functionCount > 15 &&
    notificationDeclarationAudit.undeclared.length === 0,
  "Every outbound-notification PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /create\s+table\s+public\.notification_preferences/i.test(
    notificationMigration,
  ) &&
    /create\s+table\s+public\.outbound_notification_jobs/i.test(
      notificationMigration,
    ) &&
    /create\s+table\s+public\.notification_delivery_attempts/i.test(
      notificationMigration,
    ) &&
    /alter\s+table\s+public\.outbound_notification_jobs\s+enable\s+row\s+level\s+security/i.test(
      notificationMigration,
    ),
  "Outbound notification preferences, jobs, attempts, and RLS are installed",
);
check(
  /unique\s*\(recipient_profile_id,\s*channel,\s*event_key\)/i.test(
    notificationMigration,
  ) &&
    /for\s+update\s+of\s+job\s+skip\s+locked/i.test(notificationMigration) &&
    /stale_lock_recovered/i.test(notificationMigration) &&
    /pg_advisory_xact_lock/i.test(notificationMigration),
  "Notification enqueue and processing are idempotent and concurrency-safe",
);
check(
  /exception\s+when\s+others\s+then\s+return\s+new/i.test(
    notificationMigration,
  ) &&
    /notification_schedule_appointment_reminder/i.test(notificationMigration) &&
    /interval\s+'24 hours'/i.test(notificationMigration) &&
    /time zone\s+'Asia\/Manila'/i.test(notificationMigration),
  "External delivery is best-effort and appointment reminders use Manila scheduling",
);
check(
  /auth\.role\(\)\s+is\s+distinct\s+from\s+'service_role'/i.test(
    notificationMigration,
  ) &&
    /revoke\s+all\s+on\s+table\s+public\.notification_preferences,[\s\S]*public\.outbound_notification_jobs,[\s\S]*from\s+public,\s*anon,\s*authenticated/i.test(
      notificationMigration,
    ) &&
    !/grant\s+(?:select|insert|update|delete)[^;]*outbound_notification_jobs[^;]*authenticated/i.test(
      notificationMigration,
    ),
  "Browser roles cannot access or process the outbound job queue directly",
);
check(
  /array\['date',\s*'time'\]/i.test(notificationMigration) &&
    /array\['status'\]/i.test(notificationMigration) &&
    /notification_template_variables_valid\(template_key, safe_variables\)/i.test(
      notificationMigration,
    ) &&
    !/chief_complaint|diagnosis|treatment_plan|vital_sign|pregnancy_risk|appointment_reason/i.test(
      notificationMigration,
    ),
  "Notification job variables use a strict non-clinical allowlist",
);
check(
  /manual_retry_count\s+smallint\s+not\s+null\s+default\s+0/i.test(
    notificationMigration,
  ) &&
    /manual_retry_count\s+>=\s+2/i.test(notificationMigration) &&
    /power\(2,\s*least\(next_attempt\s*-\s*1,\s*6\)\)/i.test(
      notificationMigration,
    ),
  "Notification retries and exponential backoff are explicitly bounded",
);

const backupMigration =
  migrationEntries.find(({ file }) =>
    file.includes("backup_restore_foundation"),
  )?.sql ?? "";
const backupDeclarationAudit = auditPlpgsqlIntoTargets(backupMigration);
const backupExportFunction = backupMigration.slice(
  backupMigration.indexOf(
    "create or replace function public.backup_export_snapshot",
  ),
  backupMigration.indexOf(
    "create or replace function public.backup_complete_job",
  ),
);
check(
  backupDeclarationAudit.functionCount >= 18 &&
    backupDeclarationAudit.undeclared.length === 0,
  "Every backup/restore PL/pgSQL SELECT/RETURNING INTO target is declared",
);
check(
  /create\s+table\s+public\.backup_jobs/i.test(backupMigration) &&
    /create\s+table\s+public\.restore_jobs/i.test(backupMigration) &&
    /'alaga-backups'[\s\S]*false[\s\S]*104857600/i.test(backupMigration),
  "Backup history, restore staging, and the bounded private Storage bucket are installed",
);
check(
  /backup_assert_admin[\s\S]*role is distinct from 'admin'/i.test(
    backupMigration,
  ) &&
    /revoke all on table public\.backup_configuration,[\s\S]*from public, anon, authenticated/i.test(
      backupMigration,
    ),
  "Backup administration is server-revalidated and tables remain browser-private",
);
check(
  /backup_export_snapshot[\s\S]*jsonb_build_object\([\s\S]*'residents'[\s\S]*'notification_preferences'/i.test(
    backupExportFunction,
  ) &&
    !/backup_export_snapshot[\s\S]*public\.(?:audit_logs|ai_request_rate_limits|outbound_notification_jobs|notification_delivery_attempts|assistance_notifications)/i.test(
      backupExportFunction,
    ),
  "Application backup export uses the approved data allowlist and excludes runtime logs",
);
check(
  /restore conflict in %[\s\S]*errcode = '40001'/i.test(backupMigration) &&
    /backup_restore_apply[\s\S]*lock table[\s\S]*disable trigger user[\s\S]*enable trigger user/i.test(
      backupMigration,
    ),
  "Restore conflicts abort one locked transaction while preserving foreign-key constraints",
);
check(
  /row_number\(\) over \(order by b\.completed_at desc/i.test(
    backupMigration,
  ) &&
    /ranked\.position > ranked\.retention_count/i.test(backupMigration) &&
    /retention_count smallint not null default 7/i.test(backupMigration),
  "Automatic backup retention is scheduler-ready, bounded, and defaults to seven",
);
check(
  /backup_restore_confirm[\s\S]*digest\(p_confirmation_token, 'sha256'\)/i.test(
    backupMigration,
  ) &&
    /confirmation_expires_at[\s\S]*statement_timestamp\(\) \+ interval '10 minutes'/i.test(
      backupMigration,
    ) &&
    /grant execute on function public\.backup_restore_apply\(uuid, jsonb\) to service_role/i.test(
      backupMigration,
    ) &&
    !/grant execute on function public\.backup_restore_apply\(uuid, jsonb\) to authenticated/i.test(
      backupMigration,
    ),
  "Restore confirmation is expiring and mutation remains service-role-only",
);

const functionBlocks = [
  ...allSql.matchAll(
    /create\s+or\s+replace\s+function\s+public\.([a-z_]+)\s*\([\s\S]*?\n\$\$;/gi,
  ),
];
const securityDefinerFunctions = functionBlocks.filter((match) =>
  /security\s+definer/i.test(match[0]),
);
check(
  securityDefinerFunctions.length > 0,
  "Security-definer functions were found",
);
for (const functionMatch of securityDefinerFunctions) {
  check(
    /set\s+search_path\s*=\s*''/i.test(functionMatch[0]),
    `${functionMatch[1]} has an empty fixed search_path`,
  );
}

const safeCreatedTargets = new Set(["auth.users"]);
for (const { file, sql } of migrationEntries) {
  const fileTables = [
    ...sql.matchAll(/create\s+table\s+public\.([a-z_]+)/gi),
  ].map((match) => `public.${match[1]}`);
  const availableTargets = new Set([...safeCreatedTargets, ...fileTables]);
  const references = [
    ...sql.matchAll(/references\s+((?:public|auth)\.[a-z_]+)/gi),
  ].map((match) => match[1].toLowerCase());
  for (const target of references) {
    check(
      availableTargets.has(target),
      `${file} references available table ${target}`,
    );
  }
  for (const table of fileTables) safeCreatedTargets.add(table);
}

const seed = fs.readFileSync(path.join(root, "supabase", "seed.sql"), "utf8");
const seedTargets = [
  ...seed.matchAll(/insert\s+into\s+public\.([a-z_]+)/gi),
].map((match) => match[1]);
check(
  /development only/i.test(seed),
  "Seed is clearly marked development-only",
);
check(
  seedTargets.every((table) => ["barangays", "puroks"].includes(table)),
  "Seed inserts only fictional location reference data",
);
check(
  (seed.match(/'P0[1-7]'/g) ?? []).length === 7,
  "Seed activates exactly Purok 1 through Purok 7",
);
check(
  /set is_active = false/i.test(seed) &&
    /deployment_barangay_id\(\)/i.test(seed) &&
    /'P08', 'P8'/i.test(seed),
  "Seed keeps deployment Purok 8 inactive without deleting historical references",
);
check(
  /'Lipa City'/i.test(seed) && /'Batangas'/i.test(seed),
  "Seed uses the canonical Bagongpook locality",
);

const sourceFiles = [];
function collectFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".temp", "dist", "node_modules"].includes(entry.name))
      continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(absolutePath);
    else if (!entry.name.startsWith(".env")) sourceFiles.push(absolutePath);
  }
}
collectFiles(root);
const sourceText = sourceFiles
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
check(
  !/sb_secret_[A-Za-z0-9_-]+/.test(sourceText),
  "No Supabase secret-key token appears in project files",
);
check(
  !/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(sourceText),
  "No JWT-like credential appears in project files",
);
check(
  !/VITE_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET)/.test(sourceText),
  "No secret/service-role frontend variable appears in project files",
);

if (failures.length > 0) {
  console.error(`Database verification failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Database verification passed (${checks.length} checks).`);
for (const message of checks) console.log(`- ${message}`);
