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
];
const phaseOneMigrationHashes = {
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
  "Exactly twelve expected migrations exist in lexical order",
);

const migrationEntries = migrationFiles.map((file) => ({
  file,
  sql: fs.readFileSync(path.join(migrationsDirectory, file), "utf8"),
}));
const allSql = migrationEntries.map(({ sql }) => sql).join("\n");

for (const [file, expectedHash] of Object.entries(phaseOneMigrationHashes)) {
  const sql = fs.readFileSync(path.join(migrationsDirectory, file));
  const actualHash = crypto.createHash("sha256").update(sql).digest("hex");
  check(
    actualHash === expectedHash,
    `${file} remains byte-identical to the completed Phase 1 migration`,
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
  !/for\s+delete\s+to\s+(?:anon|authenticated)/i.test(allSql),
  "No client DELETE policy exists",
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
  !/grant\s+execute\s+on\s+function\s+public\.admin_[a-z_]+[\s\S]*?to\s+authenticated/i.test(
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
  /nextval\('public\.appointment_number_seq'\)/i.test(allSql),
  "Appointment numbers use an atomic sequence",
);
check(
  /resident_number is database-generated and immutable/i.test(allSql),
  "Resident numbers are immutable",
);
check(
  /appointment_number is database-generated and immutable/i.test(allSql),
  "Appointment numbers are immutable",
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
  (seed.match(/'P0[1-8]'/g) ?? []).length === 8,
  "Seed contains eight fictional puroks",
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
