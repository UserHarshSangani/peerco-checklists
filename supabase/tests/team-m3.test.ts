import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { asUser, createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Fixtures roster Rishabh and Rajeev on 2026-11-26 (a Thursday, week of Mon 23 Nov).

async function count(tx: Transaction, sql: string): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`);
  return rows[0].n;
}

describe("shift times are checked", () => {
  it("accepts split and past-midnight shifts", async () => {
    await asUser(db, ID.managerA1, async (tx) => {
      await tx.query(
        `insert into public.shift_templates (outlet_id, name, segments) values
          ($1, 'Split', '[{"start":"11:00","end":"15:00"},{"start":"18:00","end":"23:00"}]'),
          ($1, 'Late', '[{"start":"18:00","end":"01:00"}]')`,
        [ID.outletA1],
      );
    });
  });

  it("rejects bad times", async () => {
    for (const segments of [
      '[{"start":"25:00","end":"11:00"}]',
      '[{"start":"11:00","end":"11:00"}]',
      '[{"start":"11:00"}]',
      '[{"start":"06:00","end":"23:00"},{"start":"23:30","end":"07:00"}]',
    ]) {
      await expect(
        asUser(db, ID.managerA1, (tx) =>
          tx.query(`insert into public.shift_templates (outlet_id, name, segments) values ($1, 'Bad', $2)`, [ID.outletA1, segments]),
        ),
      ).rejects.toThrow(/segments_valid/);
    }
  });

  it("a weekly off has no times", async () => {
    await asUser(db, ID.managerA1, async (tx) => {
      await tx.query(
        `insert into public.roster_entries (outlet_id, staff_id, business_date, kind) values ($1, $2, '2026-11-27', 'weekly_off')`,
        [ID.outletA1, ID.rishabh],
      );
    });
    await expect(
      asUser(db, ID.managerA1, (tx) =>
        tx.query(
          `insert into public.roster_entries (outlet_id, staff_id, business_date, kind, segments)
           values ($1, $2, '2026-11-27', 'weekly_off', '[{"start":"12:00","end":"21:00"}]')`,
          [ID.outletA1, ID.rishabh],
        ),
      ),
    ).rejects.toThrow(/kind_segments/);
  });

  it("allows a minimum slot past midnight", async () => {
    await asUser(db, ID.managerA1, async (tx) => {
      await tx.query(
        `insert into public.staffing_minimums (outlet_id, role_skill, slot_start, slot_end, min_count)
         values ($1, 'floor', '22:00', '01:00', 1)`,
        [ID.outletA1],
      );
    });
  });
});

describe("roster rules across outlets", () => {
  it("won't use another outlet's shift template", async () => {
    await expect(
      asUser(db, ID.ownerA, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `insert into public.shift_templates (outlet_id, name, segments)
           values ($1, 'A2 day', '[{"start":"10:00","end":"19:00"}]') returning id`,
          [ID.outletA2],
        );
        await tx.query(
          `insert into public.roster_entries (outlet_id, staff_id, business_date, shift_template_id, segments)
           values ($1, $2, '2026-11-28', $3, '[{"start":"10:00","end":"19:00"}]')`,
          [ID.outletA1, ID.rishabh, rows[0].id],
        );
      }),
    ).rejects.toThrow(/another outlet/);
  });

  it("keeps managers and staff to their own rows", async () => {
    const other = await asUser(db, ID.ownerB, (tx) =>
      count(tx, `select 1 from public.roster_entries where outlet_id = '${ID.outletA1}'`),
    );
    expect(other).toBe(0);
    const mine = await asUser(db, ID.staffUserRishabh, (tx) => count(tx, `select 1 from public.roster_entries`));
    expect(mine).toBe(1);
    // Staff can read their own shifts but not change them.
    const changed = await asUser(db, ID.staffUserRishabh, (tx) =>
      tx.query(`update public.roster_entries set role_skill = 'cashier' where staff_id = '${ID.rishabh}'`),
    );
    expect(changed.affectedRows).toBe(0);
    // The tablet login reads no roster rows directly.
    expect(await asUser(db, ID.deviceA1, (tx) => count(tx, `select 1 from public.roster_entries`))).toBe(0);
  });

  it("writes roster changes to the audit log with the manager's id", async () => {
    await asUser(db, ID.managerA1, async (tx) => {
      await tx.query(
        `update public.roster_entries set segments = '[{"start":"13:00","end":"22:00"}]'
          where staff_id = $1 and business_date = '2026-11-26'`,
        [ID.rishabh],
      );
      const { rows } = await tx.query<{ actor: string; action: string }>(
        `select actor, action from public.audit_log where table_name = 'roster_entries' order by id desc limit 1`,
      );
      expect(rows[0]).toEqual({ actor: ID.managerA1, action: "update" });
    });
  });
});

describe("copy last week", () => {
  const copy = (tx: Transaction, overwrite = false) =>
    tx.query<{ n: number }>(`select public.team_copy_roster_week($1, '2026-11-23', '2026-11-30', $2) as n`, [
      ID.outletA1,
      overwrite,
    ]);

  it("copies each person's week seven days on", async () => {
    await asUser(db, ID.managerA1, async (tx) => {
      expect((await copy(tx)).rows[0].n).toBe(2);
      const { rows } = await tx.query<{ staff_id: string; source: string }>(
        `select staff_id, source from public.roster_entries where business_date = '2026-12-03' order by staff_id`,
      );
      expect(rows).toEqual([
        { staff_id: ID.rishabh, source: "copied" },
        { staff_id: ID.rajeev, source: "copied" },
      ]);
      // Running it again changes nothing unless asked to overwrite.
      expect((await copy(tx)).rows[0].n).toBe(0);
      expect((await copy(tx, true)).rows[0].n).toBe(2);
    });
  });

  it("leaves out people who have left", async () => {
    await asUser(db, ID.ownerA, async (tx) => {
      await tx.exec(`update public.staff_profiles set employment_status = 'exited' where staff_id = '${ID.rajeev}'`);
      expect((await copy(tx)).rows[0].n).toBe(1);
    });
  });

  it("refuses another organisation and odd gaps", async () => {
    await expect(asUser(db, ID.ownerB, (tx) => copy(tx))).rejects.toThrow(/not allowed/);
    await expect(
      asUser(db, ID.managerA1, (tx) =>
        tx.query(`select public.team_copy_roster_week($1, '2026-11-23', '2026-11-25')`, [ID.outletA1]),
      ),
    ).rejects.toThrow(/whole weeks/);
    await expect(
      asUser(db, null, (tx) => tx.query(`select public.team_copy_roster_week($1, '2026-11-23', '2026-11-30')`, [ID.outletA1])),
    ).rejects.toThrow(/permission denied/);
  });
});
