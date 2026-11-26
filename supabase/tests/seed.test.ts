import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type Db } from "./harness/db";

const SEED = readFileSync(join(__dirname, "..", "seed", "team_demo.sql"), "utf8");
const OUTLET = "de100000-0000-0000-0000-000000000001";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await db.exec(SEED);
}, 60_000);

async function count(sql: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(sql, [OUTLET]);
  return rows[0].n;
}

describe("demo seed", () => {
  it("creates 8 staff with profiles, skills and salaries", async () => {
    expect(await count(`select count(*)::int n from public.staff where outlet_id = $1`)).toBe(8);
    expect(await count(`select count(*)::int n from public.staff_profiles where outlet_id = $1`)).toBe(8);
    expect(await count(`select count(*)::int n from public.salary_structures where outlet_id = $1`)).toBe(8);
  });

  it("rosters two weeks for everyone, with weekly offs", async () => {
    expect(await count(`select count(*)::int n from public.roster_entries where outlet_id = $1`)).toBe(8 * 14);
    expect(await count(`select count(*)::int n from public.roster_entries where outlet_id = $1 and kind = 'weekly_off'`)).toBeGreaterThan(8);
  });

  it("records attendance with some unapproved absences, and none for today", async () => {
    expect(await count(`select count(*)::int n from public.attendance_events where outlet_id = $1`)).toBeGreaterThan(100);
    expect(await count(`select count(*)::int n from public.attendance_days where outlet_id = $1 and status = 'absent_unapproved'`)).toBeGreaterThan(0);
    expect(
      await count(`select count(*)::int n from public.attendance_events
                    where outlet_id = $1 and business_date = (now() at time zone 'Asia/Kolkata')::date`),
    ).toBe(0);
  });

  it("keeps tablet PINs working (bcrypt, same as create_staff)", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `select extensions.crypt('1111', pin_hash) = pin_hash as ok from public.staff where name = 'Rishabh' and outlet_id = $1`,
      [OUTLET],
    );
    expect(rows[0].ok).toBe(true);
  });

  it("creates a draft payroll run and is safe to run twice", async () => {
    expect(await count(`select count(*)::int n from public.payroll_runs where outlet_id = $1 and status = 'draft'`)).toBe(1);
    await db.exec(SEED);
    expect(await count(`select count(*)::int n from public.staff where outlet_id = $1`)).toBe(8);
  });
});
