import fs from "node:fs";
import path from "node:path";

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
];
const expectedTables = [
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
  "Exactly eleven expected migrations exist in lexical order",
);

const migrationEntries = migrationFiles.map((file) => ({
  file,
  sql: fs.readFileSync(path.join(migrationsDirectory, file), "utf8"),
}));
const allSql = migrationEntries.map(({ sql }) => sql).join("\n");

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
  "Only the seven Phase 1 public tables are created",
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
  "RLS is enabled on every Phase 1 table",
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
    if ([".git", "dist", "node_modules"].includes(entry.name)) continue;
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
