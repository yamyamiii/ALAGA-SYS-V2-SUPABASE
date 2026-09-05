import fs from "node:fs";

import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  "supabase/migrations/20260720005600_enforce_appointment_start_slots.sql",
  "utf8",
);

describe("appointment start-time database safety", () => {
  it("enforces inclusive 08:00 through 16:00 Manila start slots", () => {
    expect(migration).toMatch(
      /p_start_time between time '08:00' and time '16:00'/i,
    );
    expect(migration).toMatch(
      /extract\(minute from p_start_time\) in \(0, 30\)/i,
    );
    expect(migration).toMatch(/extract\(second from p_start_time\) = 0/i);
    expect(migration).toMatch(/Asia\/Manila/i);
  });

  it("guards every appointment insert and explicit schedule update", () => {
    expect(migration).toMatch(
      /before insert or update of start_time on public\.appointments/i,
    );
    expect(migration).toMatch(
      /appointment_start_time_valid\(new\.start_time\) is not true/i,
    );
  });

  it("keeps validation helpers private and introduces no browser writes", () => {
    expect(migration).toMatch(
      /revoke all on function public\.appointment_start_time_valid\(time\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.enforce_appointment_start_time_slot\(\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  it("does not rewrite or delete existing appointment history", () => {
    expect(migration).not.toMatch(
      /delete from public\.appointments|update public\.appointments\s+set/i,
    );
    expect(migration).not.toMatch(/alter table public\.appointments/i);
  });
});
