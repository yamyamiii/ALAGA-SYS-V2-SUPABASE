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
};
const expectedTables = [
  "admin_action_rate_limits",
  "appointment_request_events",
  "appointments",
  "audit_logs",
  "barangays",
  "child_growth_measurements",
  "child_health_profiles",
  "child_health_visits",
  "child_immunizations",
  "health_encounters",
  "households",
  "maternal_delivery_outcomes",
  "maternal_postnatal_visits",
  "maternal_pregnancies",
  "maternal_prenatal_visits",
  "profiles",
  "puroks",
  "resident_allergies",
  "resident_medical_history",
  "residents",
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
  "Exactly twenty-six expected migrations exist in lexical order",
);

const migrationEntries = migrationFiles.map((file) => ({
  file,
  sql: fs.readFileSync(path.join(migrationsDirectory, file), "utf8"),
}));
const allSql = migrationEntries.map(({ sql }) => sql).join("\n");

for (const [file, expectedHash] of Object.entries(completedMigrationHashes)) {
  const sql = fs.readFileSync(path.join(migrationsDirectory, file));
  const actualHash = crypto.createHash("sha256").update(sql).digest("hex");
  check(
    actualHash === expectedHash,
    `${file} remains byte-identical to its completed migration`,
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
    /h\.archived_at is null/i.test(allSql),
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
