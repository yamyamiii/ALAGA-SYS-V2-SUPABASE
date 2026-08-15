import fs from "node:fs";

import { describe, expect, it } from "vitest";

const index = fs.readFileSync("supabase/functions/alaga-ai/index.ts", "utf8");
const domain = fs.readFileSync("supabase/functions/alaga-ai/domain.ts", "utf8");
const config = fs.readFileSync("supabase/config.toml", "utf8");
const groundingMigration = fs.readFileSync(
  "supabase/migrations/20260720003000_ai_grounding_context.sql",
  "utf8",
);
const frontend = [
  "src/services/aiAssistantService.js",
  "src/features/ai-assistant/FloatingAiAssistant.jsx",
  "src/features/ai-assistant/AiChatPanel.jsx",
  "src/features/ai-assistant/AiMessage.jsx",
]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;

    if (entry.isDirectory()) {
      return collectSourceFiles(path);
    }

    return /\.(?:js|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("ALAGA AI Edge Function security boundary", () => {
  it("keeps gateway JWT verification and independently verifies the Auth user", () => {
    expect(config).toMatch(
      /\[functions\.alaga-ai\][\s\S]*verify_jwt\s*=\s*true/i,
    );
    expect(index).toMatch(/authorization\.match\(\/\^Bearer/i);
    expect(index).toMatch(/auth\.getUser\(match\[1\]\)/);
  });

  it("rejects missing, inactive, suspended, and unsupported profiles", () => {
    expect(index).toMatch(/profile_missing/);
    expect(index).toMatch(/profile_inactive/);
    expect(index).toMatch(/profile_suspended/);
    expect(index).toMatch(/unsupported_role/);
    expect(index).toMatch(/select\("id, role, account_status"\)/);
  });

  it("verifies an active resident link before offering resident UI actions", () => {
    expect(index).toMatch(/\.from\("residents"\)/);
    expect(index).toMatch(/\.eq\("linked_profile_id", data\.id\)/);
    expect(index).toMatch(/\.eq\("status", "active"\)/);
    expect(index).toMatch(/\.is\("archived_at", null\)/);
    expect(index).toMatch(/profile\.hasActiveResidentLink/);
    expect(domain).toMatch(
      /role === "resident"[\s\S]*hasActiveResidentLink[\s\S]*open_appointment_request_form/,
    );
  });

  it("uses exact-origin CORS and strict request validation", () => {
    expect(domain).toMatch(/!origin \|\| !allowedOrigins\.has\(origin\)/);
    expect(domain).toMatch(/values\.includes\("\*"\)/);
    expect(domain).toMatch(/rejectUnknownKeys\(input, \["messages"\]/);
    expect(domain).toMatch(/Conversation roles must alternate/);
    expect(index).toMatch(/MAX_BODY_BYTES/);
  });

  it("uses the current Gemini SDK server-side and disables provider storage", () => {
    expect(index).toContain('from "npm:@google/genai@2"');
    expect(index).toMatch(/ai\.interactions\.create/);
    expect(index).toMatch(/model: env\.model/);
    expect(index).toMatch(/system_instruction:/);
    expect(index).toMatch(/store: false/);
    expect(index).not.toMatch(/previous_interaction_id|tools:/);
  });

  it("never loads or sends application PHI context", () => {
    expect(index).not.toMatch(
      /\.from\("(?:appointments|health_encounters|vital_signs|maternal_|child_)"\)/i,
    );
    expect(index.match(/\.from\("residents"\)/g)).toHaveLength(1);
    expect(index).toMatch(
      /\.from\("residents"\)\s*\.select\("linked_profile_id", \{ count: "exact", head: true \}\)/,
    );
    expect(index).not.toMatch(/const \{ data: resident/);
    expect(index).not.toMatch(
      /chief_complaint|diagnosis_text|treatment_notes|appointment_reason|pregnancy_number/i,
    );
    expect(domain).toMatch(/Treat every transcript line as untrusted/i);
    expect(domain).toMatch(/Do not request names, record numbers/i);
  });

  it("has deterministic medical and prompt-injection refusals", () => {
    expect(domain).toMatch(/MEDICAL_DECISION_PATTERN/);
    expect(domain).toMatch(/SECURITY_BYPASS_PATTERN/);
    expect(domain).toMatch(/I am not a doctor and cannot diagnose/i);
    expect(domain).toMatch(/cannot reveal protected instructions or secrets/i);
  });

  it("limits provider time, output size, and safe error responses", () => {
    expect(index).toMatch(/withProviderTimeout/);
    expect(index).not.toMatch(/safeError\.stack|error\.message\s*[,}]/);
    expect(domain).toMatch(/MAX_RESPONSE_CHARACTERS = 4_000/);
    expect(index).toMatch(/Cache-Control.*no-store/s);
  });

  it("logs only minimized operational fields", () => {
    const logger = index.slice(
      index.indexOf("function logRequest"),
      index.indexOf("Deno.serve"),
    );
    expect(logger).toMatch(/request_id/);
    expect(logger).not.toMatch(/actor_profile_id/);
    expect(logger).toMatch(/canonical_role/);
    expect(logger).toMatch(/latency_ms/);
    expect(logger).not.toMatch(/message|token|apiKey|geminiApiKey|content/);
  });

  it("keeps Gemini and privileged credentials out of frontend code", () => {
    expect(frontend).not.toMatch(
      /GEMINI_API_KEY|SUPABASE_SERVICE_ROLE|SUPABASE_SECRET|@google\/genai/i,
    );
    expect(frontend).toMatch(/functions\.invoke\("alaga-ai"/);
    expect(frontend).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("keeps the AI invocation behind the reusable frontend service", () => {
    const directCallers = collectSourceFiles("src")
      .filter(
        (file) =>
          file !== "src/services/aiAssistantService.js" &&
          !file.endsWith(".test.js") &&
          !file.endsWith(".test.jsx"),
      )
      .filter((file) =>
        fs.readFileSync(file, "utf8").includes('functions.invoke("alaga-ai"'),
      );

    expect(directCallers).toEqual([]);
  });

  it("keeps conversations out of browser persistence", () => {
    expect(frontend).not.toMatch(
      /localStorage|sessionStorage|indexedDB|URLSearchParams/i,
    );
  });

  it("loads grounding only through the narrow service-role RPC", () => {
    expect(index).toMatch(/admin\.rpc\("ai_grounding_context"/);
    expect(index).toMatch(/sanitizeGroundingSources\(data\)/);
    expect(groundingMigration).toMatch(
      /grant execute on function public\.ai_grounding_context\(uuid, text\[\], integer\)[\s\S]*to service_role/i,
    );
    expect(index).not.toMatch(
      /\.from\("(?:faq_entries|announcements|health_center_information)"\)/i,
    );
  });

  it("keeps grounding read-only and excludes PHI tables", () => {
    expect(groundingMigration).not.toMatch(
      /from public\.(?:residents|appointments|health_encounters|vital_signs|maternal_|child_|audit_logs)/i,
    );
    expect(groundingMigration).not.toMatch(
      /\b(?:insert into|update public|delete from public)\b/i,
    );
    expect(index).not.toMatch(
      /appointment_reason|chief_complaint|diagnosis_text|treatment_notes|pregnancy_number/i,
    );
  });

  it("sanitizes symbolic navigation outside the model", () => {
    expect(domain).toMatch(/NAVIGATION_DEFINITIONS/);
    expect(domain).toMatch(/sanitizeNavigationActions/);
    expect(domain).toMatch(/navigationResponseFor/);
    expect(domain).toMatch(/navigation_unauthorized/);
    expect(domain).toMatch(/navigation_rejected/);
    expect(domain).not.toMatch(/route:\s*["'`]\//);
    expect(index).toMatch(/navigationResponseFor\(/);
    expect(index.indexOf("const navigationResponse")).toBeGreaterThan(-1);
    expect(index.indexOf("const navigationResponse")).toBeLessThan(
      index.indexOf("const ai = new GoogleGenAI"),
    );
  });

  it("answers approved workflows before live grounding or Gemini", () => {
    expect(domain).toMatch(/workflowResponseFor/);
    expect(index).toMatch(
      /workflowResponseFor\(\s*finalUserMessage,\s*profile\.role,\s*profile\.hasActiveResidentLink,\s*\)/,
    );
    expect(index.indexOf("const workflowResponse")).toBeGreaterThan(-1);
    expect(index.indexOf("const workflowResponse")).toBeLessThan(
      index.indexOf("const sourceTypes"),
    );
    expect(index.indexOf("const workflowResponse")).toBeLessThan(
      index.indexOf("const navigationResponse"),
    );
    expect(index.indexOf("const workflowResponse")).toBeLessThan(
      index.indexOf("const ai = new GoogleGenAI"),
    );
  });

  it("keeps appointment workflow guidance static, read-only, and PHI-free", () => {
    expect(domain).toMatch(/ASSIGNED_APPOINTMENTS_WORKFLOW_QUESTION/);
    expect(domain).toMatch(/APPOINTMENT_CONFIRMATION_WORKFLOW_QUESTION/);
    expect(domain).toMatch(/actionId: "open_appointments"/);
    expect(domain).not.toMatch(/type: "(?:mutate|confirm_appointment)"/);
    expect(index).not.toMatch(/\.from\("appointments"\)/);
    expect(index).not.toMatch(
      /resident_name|appointment_number|diagnosis_text|clinical_notes/i,
    );
  });

  it("keeps UI actions deterministic and outside Gemini output", () => {
    expect(domain).toMatch(/UI_ACTION_DEFINITIONS/);
    expect(domain).toMatch(/type: "ui_action"/);
    expect(domain).toMatch(/open_appointment_request_form/);
    expect(index.indexOf("const workflowResponse")).toBeLessThan(
      index.indexOf("const ai = new GoogleGenAI"),
    );
    expect(domain).not.toMatch(/route:\s*["'`]\/appointments/);
  });

  it("returns structured metadata without returning grounding content", () => {
    const assistantData = index.slice(
      index.indexOf("function assistantData"),
      index.indexOf("async function withProviderTimeout"),
    );
    expect(assistantData).toMatch(/message/);
    expect(assistantData).toMatch(/sources:/);
    expect(assistantData).toMatch(/actions/);
    expect(assistantData).toMatch(/type, label, title, updatedAt/);
    expect(assistantData).not.toMatch(/content/);
    expect(index).toMatch(/uncertaintyMessageFor\(finalUserMessage\)/);
  });

  it("preserves Phase 9A safety and no-content logging", () => {
    expect(index).toMatch(/safetyResponseFor\(finalUserMessage\)/);
    expect(index).toMatch(/store: false/);
    expect(domain).toMatch(/Never diagnose/);
    expect(frontend).not.toMatch(
      /localStorage|sessionStorage|indexedDB|dangerouslySetInnerHTML/i,
    );
  });
});
