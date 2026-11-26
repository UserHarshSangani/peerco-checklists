import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Rishabh (A1) joined 2026-06-01: Gullak unlocks on 2026-09-01, 2026-12-01,
// 2027-06-01, then every June. Dates below are in 2027, driven by p_now.

async function run<T>(userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (userId) {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        await tx.exec("set local role authenticated");
      }
      try {
        result = await fn(tx);
      } catch (error) {
        failure = error;
      }
      await tx.rollback();
    })
    .catch(() => {});
  if (failure) throw failure;
  return result as T;
}

async function as(tx: Transaction, userId: string | null) {
  await tx.exec("reset role");
  if (userId) {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec("set local role authenticated");
  }
}

async function failure(tx: Transaction, sql: string): Promise<string | null> {
  await tx.exec("savepoint probe");
  try {
    await tx.query(sql);
    await tx.exec("release savepoint probe");
    return null;
  } catch (error) {
    await tx.exec("rollback to savepoint probe");
    return (error as Error).message;
  }
}

const plus = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const at = (date: string, time = "23:30") => `${date}T${time}:00+05:30`;

/** Streak as of the end of `lastCounted`. */
async function streak(tx: Transaction, day: number, lastCounted: string, staff: string = ID.rishabh) {
  await tx.query(
    `insert into public.gullak_streaks (staff_id, outlet_id, current_day, current_level, last_counted_date)
     values ($1, $2, $3, 1, $4)
     on conflict (staff_id) do update set current_day = excluded.current_day, last_counted_date = excluded.last_counted_date`,
    [staff, ID.outletA1, day, lastCounted],
  );
}

/** Rostered workdays with these attendance statuses (null = rostered, no summary yet). */
async function days(tx: Transaction, from: string, statuses: (string | null)[], staff: string = ID.rishabh) {
  for (const [i, status] of statuses.entries()) {
    const date = plus(from, i);
    const kind = status === "weekly_off" ? "weekly_off" : "work";
    await tx.query(
      `insert into public.roster_entries (outlet_id, staff_id, business_date, kind, segments, role_skill, source)
       values ($1, $2, $3, $4, $5::jsonb, 'floor', 'manual')
       on conflict (staff_id, business_date) do update set kind = excluded.kind, segments = excluded.segments`,
      [ID.outletA1, staff, date, kind, kind === "work" ? '[{"start":"12:00","end":"21:00"}]' : "[]"],
    );
    await tx.query(`delete from public.attendance_days where staff_id = $1 and business_date = $2`, [staff, date]);
    if (status) {
      await tx.query(
        `insert into public.attendance_days (staff_id, outlet_id, business_date, status) values ($1, $2, $3, $4)`,
        [staff, ID.outletA1, date, status],
      );
    }
  }
}

async function gullakRun(tx: Transaction, now: string, staff: string = ID.rishabh) {
  return (await tx.query<{ n: number }>(`select private.team_gullak_run($1, $2::timestamptz) as n`, [staff, now])).rows[0].n;
}

const state = async (tx: Transaction, staff: string = ID.rishabh) =>
  (await tx.query<{ current_day: number; current_level: number; last_counted_date: string }>(
    `select current_day, current_level, to_char(last_counted_date, 'YYYY-MM-DD') last_counted_date
       from public.gullak_streaks where staff_id = $1`, [staff],
  )).rows[0];

const ledger = async (tx: Transaction, staff: string = ID.rishabh) =>
  (await tx.query<{ date: string; kind: string; amount: number; day: number | null; months: number | null }>(
    `select to_char(business_date, 'YYYY-MM-DD') date, kind, amount_paise::int amount, streak_day as day, milestone_months as months
       from public.gullak_ledger where staff_id = $1 order by business_date, kind`, [staff],
  )).rows;

const setting = (tx: Transaction, key: string, value: string) =>
  tx.query(`insert into public.outlet_settings (outlet_id, key, value) values ($1, $2, $3::jsonb)`, [ID.outletA1, key, value]);

describe("daily credit", () => {
  it("credits each attended day at its level, split 50/50", async () => {
    await run(null, async (tx) => {
      await streak(tx, 5, "2027-01-03");
      await days(tx, "2027-01-04", ["present", "half_day", "present"]);
      expect(await gullakRun(tx, at("2027-01-06"))).toBe(3);
      expect(await ledger(tx)).toEqual([
        { date: "2027-01-04", kind: "credit_locked", amount: 1000, day: 6, months: null },
        { date: "2027-01-04", kind: "credit_payable", amount: 1000, day: 6, months: null },
        { date: "2027-01-05", kind: "credit_locked", amount: 1500, day: 7, months: null },
        { date: "2027-01-05", kind: "credit_payable", amount: 1500, day: 7, months: null },
        { date: "2027-01-06", kind: "credit_locked", amount: 1500, day: 8, months: null },
        { date: "2027-01-06", kind: "credit_payable", amount: 1500, day: 8, months: null },
      ]);
      expect(await state(tx)).toEqual({ current_day: 8, current_level: 2, last_counted_date: "2027-01-06" });
      // Running again changes nothing.
      expect(await gullakRun(tx, at("2027-01-06"))).toBe(0);
      expect(await ledger(tx)).toHaveLength(6);
    });
  });

  it("today counts as soon as they're in; not before", async () => {
    await run(null, async (tx) => {
      await streak(tx, 0, "2027-01-03");
      await days(tx, "2027-01-04", [null]);
      expect(await gullakRun(tx, at("2027-01-04", "11:00"))).toBe(0);
      expect((await state(tx)).last_counted_date).toBe("2027-01-03");
      await days(tx, "2027-01-04", ["present"]);
      expect(await gullakRun(tx, at("2027-01-04", "12:05"))).toBe(1);
      expect(await state(tx)).toMatchObject({ current_day: 1, last_counted_date: "2027-01-04" });
    });
  });

  it("weekly offs, leave and unrostered days don't break the streak", async () => {
    await run(null, async (tx) => {
      await streak(tx, 3, "2027-01-03");
      await days(tx, "2027-01-04", ["present", "weekly_off", "leave", "present"]);
      await gullakRun(tx, at("2027-01-08"));
      expect(await state(tx)).toMatchObject({ current_day: 5, last_counted_date: "2027-01-07" });
      expect((await ledger(tx)).filter((r) => r.kind === "credit_payable").map((r) => r.day)).toEqual([4, 5]);
    });
  });

  it("a day waiting for the manager holds the count", async () => {
    await run(null, async (tx) => {
      await streak(tx, 3, "2027-01-03");
      await days(tx, "2027-01-04", ["present", "needs_confirmation", "present"]);
      await gullakRun(tx, at("2027-01-08"));
      expect(await state(tx)).toMatchObject({ current_day: 4, last_counted_date: "2027-01-04" });
      await tx.query(`update public.attendance_days set status = 'present' where staff_id = $1 and business_date = '2027-01-05'`, [ID.rishabh]);
      await gullakRun(tx, at("2027-01-08"));
      expect(await state(tx)).toMatchObject({ current_day: 6, last_counted_date: "2027-01-07" });
    });
  });
});

describe("unapproved absence", () => {
  it("waits a day for a fix, then drops one level: Day 64 → Day 7", async () => {
    await run(null, async (tx) => {
      await streak(tx, 64, "2027-01-03");
      await days(tx, "2027-01-04", ["absent_unapproved", "present"]);
      await gullakRun(tx, at("2027-01-05"));
      expect(await state(tx)).toMatchObject({ current_day: 64, last_counted_date: "2027-01-03" });
      await gullakRun(tx, at("2027-01-06", "09:00"));
      expect(await state(tx)).toMatchObject({ current_day: 7, current_level: 2, last_counted_date: "2027-01-05" });
      expect((await ledger(tx)).find((r) => r.kind === "credit_payable")).toMatchObject({ date: "2027-01-05", day: 7, amount: 1500 });
    });
  });

  it("from the ₹20 level, starts again at Day 1", async () => {
    await run(null, async (tx) => {
      await streak(tx, 4, "2027-01-03");
      await days(tx, "2027-01-04", ["absent_unapproved", "present"]);
      await gullakRun(tx, at("2027-01-06", "09:00"));
      expect(await state(tx)).toMatchObject({ current_day: 1 });
    });
  });
});

describe("settings", () => {
  it("monthly cap: days keep counting, credit stops", async () => {
    await run(null, async (tx) => {
      await setting(tx, "gullak.monthly_cap_paise", "3000");
      await streak(tx, 0, "2027-01-03");
      await days(tx, "2027-01-04", ["present", "present", "present"]);
      await gullakRun(tx, at("2027-01-06"));
      const credits = (await ledger(tx)).filter((r) => r.kind.startsWith("credit"));
      expect(credits.reduce((s, r) => s + r.amount, 0)).toBe(3000);
      expect(await state(tx)).toMatchObject({ current_day: 3 });
    });
  });

  it("switched off: nothing is credited and the streak waits", async () => {
    await run(null, async (tx) => {
      await setting(tx, "gullak.enabled", "false");
      await streak(tx, 10, "2027-01-03");
      await days(tx, "2027-01-04", ["present", "present"]);
      await gullakRun(tx, at("2027-01-05"));
      expect(await ledger(tx)).toEqual([]);
      expect(await state(tx)).toMatchObject({ current_day: 10, last_counted_date: "2027-01-05" });
    });
  });

  it("without the top level, day 90+ stays at ₹40", async () => {
    await run(null, async (tx) => {
      await setting(tx, "gullak.top_level_enabled", "false");
      await streak(tx, 95, "2027-01-03");
      await days(tx, "2027-01-04", ["present"]);
      await gullakRun(tx, at("2027-01-04"));
      expect((await ledger(tx)).find((r) => r.kind === "credit_payable")?.amount).toBe(2000);
    });
  });
});

describe("unlocks", () => {
  it("at 12 months the locked balance up to that day becomes payable, once", async () => {
    await run(null, async (tx) => {
      await tx.query(
        `insert into public.gullak_ledger (staff_id, outlet_id, business_date, kind, amount_paise, streak_day, level) values
           ($1, $2, '2027-03-01', 'credit_locked', 2000, 1, 1), ($1, $2, '2027-03-01', 'credit_payable', 2000, 1, 1)`,
        [ID.rishabh, ID.outletA1],
      );
      await streak(tx, 40, "2027-05-30");
      await days(tx, "2027-05-31", ["present", "present", "present"]);
      await gullakRun(tx, at("2027-06-02"));
      const unlocks = (await ledger(tx)).filter((r) => r.kind === "unlock");
      // ₹20 earlier + ₹20 on 31 May + ₹20 on 1 June; 2 June's ₹20 waits for June 2028.
      expect(unlocks).toEqual([{ date: "2027-06-01", kind: "unlock", amount: 6000, day: null, months: 12 }]);
      const note = (await tx.query<{ payload: Record<string, unknown> }>(
        `select payload from public.notifications where kind = 'gullak_unlocked'`)).rows;
      expect(note).toEqual([{ payload: { amount_paise: 6000, months: 12, date: "2027-06-01" } }]);
      await gullakRun(tx, at("2027-06-02"));
      expect((await ledger(tx)).filter((r) => r.kind === "unlock")).toHaveLength(1);
      const locked = (await tx.query<{ v: number }>(`select private.team_gullak_locked($1)::int v`, [ID.rishabh])).rows[0].v;
      expect(locked).toBe(2000);
    });
  });

  it("new staff start counting from their joining date", async () => {
    await run(null, async (tx) => {
      await tx.query(`update public.staff_profiles set joining_date = '2027-01-05' where staff_id = $1`, [ID.rishabh]);
      await days(tx, "2027-01-04", ["present", "present"]);
      await gullakRun(tx, at("2027-01-05"));
      expect(await state(tx)).toMatchObject({ current_day: 1, last_counted_date: "2027-01-05" });
    });
  });
});

describe("who sees what", () => {
  it("staff see their own card; managers see the outlet; others see nothing", async () => {
    await run(null, async (tx) => {
      await streak(tx, 63, "2027-01-03");
      await days(tx, "2027-01-04", ["present"]);
      await gullakRun(tx, at("2027-01-04"));
      await as(tx, ID.staffUserRishabh);
      const mine = (await tx.query<{ g: Record<string, unknown> }>(`select public.team_my_gullak() g`)).rows[0].g;
      expect(mine).toMatchObject({
        day: 64, level: 3, level_amount_paise: 4000, next_level_day: 90, next_level_amount_paise: 5000,
        total_paise: 4000, locked_paise: 2000, next_unlock_date: "2027-06-01", next_unlock_months: 12,
      });
      expect((mine.history as unknown[])[0]).toMatchObject({ date: "2027-01-04", kind: "credit", amount_paise: 4000, day: 64 });
      expect(await failure(tx, `select private.team_gullak_run('${ID.rishabh}')`)).toMatch(/permission denied/);
      expect(await failure(tx, `insert into public.gullak_ledger (staff_id, outlet_id, business_date, kind, amount_paise)
        values ('${ID.rishabh}', '${ID.outletA1}', '2027-01-05', 'credit_payable', 100000)`)).toMatch(/permission denied/);

      await as(tx, ID.managerA1);
      const board = (await tx.query<{ b: { name: string; day: number }[] }>(`select public.team_gullak_board($1) b`, [ID.outletA1])).rows[0].b;
      expect(board.find((r) => r.name === "Rishabh")).toMatchObject({ day: 64 });

      await as(tx, ID.ownerB);
      expect((await tx.query<{ b: unknown }>(`select public.team_gullak_board($1) b`, [ID.outletA1])).rows[0].b).toBeNull();
    });
  });

  it("the sweep runs everyone", async () => {
    await run(null, async (tx) => {
      const r = (await tx.query<{ r: { people: number } }>(`select private.team_gullak_sweep() r`)).rows[0].r;
      expect(r.people).toBeGreaterThan(0);
    });
  });
});
