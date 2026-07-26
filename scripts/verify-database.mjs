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
};
const expectedTables = [
  "admin_action_rate_limits",
  "appointments",
  "audit_logs",
  "barangays",
  "households",
  "profiles",
  "puroks",
  "residents",
];

const failures = [];
const checks = [];

function check(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

const migrationFiles = fs
  .readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

check(
  JSON.stringify(migrationFiles) === JSON.stringify(expectedMigrations),
  "Exactly eighteen expected migrations exist in lexical order",
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
  "Only the seven Phase 1 tables and one Phase 2B operational table are created",
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
