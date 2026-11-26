import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { asUser, createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

async function ids(tx: Transaction, sql: string): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(sql);
  return rows.map((r) => r.id).sort();
}

const profilesSql = `select staff_id as id from public.staff_profiles`;
const rosterSql = `select staff_id as id from public.roster_entries`;
const salarySql = `select staff_id as id from public.salary_structures`;

describe("team RLS: who sees whose people", () => {
  it("manager sees only their outlet", async () => {
    const seen = await asUser(db, ID.managerA1, (tx) => ids(tx, profilesSql));
    expect(seen).toEqual([ID.rishabh, ID.rajeev].sort());
  });

  it("owner sees every outlet in their organization, and nothing in another", async () => {
    expect(await asUser(db, ID.ownerA, (tx) => ids(tx, profilesSql))).toEqual([ID.rishabh, ID.rajeev].sort());
    expect(await asUser(db, ID.ownerB, (tx) => ids(tx, profilesSql))).toEqual([ID.bina]);
  });

  it("peerco_admin sees everyone", async () => {
    expect(await asUser(db, ID.admin, (tx) => ids(tx, profilesSql))).toHaveLength(3);
  });

  it("staff see only their own records", async () => {
    expect(await asUser(db, ID.staffUserRishabh, (tx) => ids(tx, profilesSql))).toEqual([ID.rishabh]);
    expect(await asUser(db, ID.staffUserRishabh, (tx) => ids(tx, rosterSql))).toEqual([ID.rishabh]);
    expect(await asUser(db, ID.staffUserRishabh, (tx) => ids(tx, salarySql))).toEqual([ID.rishabh]);
  });

  it("the outlet tablet reads no team tables directly", async () => {
    for (const sql of [profilesSql, rosterSql, salarySql, `select outlet_id as id from public.outlet_settings`]) {
      expect(await asUser(db, ID.deviceA1, (tx) => ids(tx, sql))).toEqual([]);
    }
  });

  it("logged-out requests get nothing", async () => {
    await expect(asUser(db, null, (tx) => ids(tx, profilesSql))).rejects.toThrow(/permission denied/);
  });
});

describe("team RLS: pay data", () => {
  it("managers can't see salaries unless the outlet allows it", async () => {
    expect(await asUser(db, ID.managerA1, (tx) => ids(tx, salarySql))).toEqual([]);
    expect(await asUser(db, ID.ownerA, (tx) => ids(tx, salarySql))).toEqual([ID.rishabh, ID.rajeev].sort());

    const seen = await asUser(db, ID.ownerA, async (tx) => {
      await tx.query(
        `insert into public.outlet_settings (outlet_id, key, value) values ($1, 'team.managers_see_pay', 'true')`,
        [ID.outletA1],
      );
      // Same transaction, now acting as the manager.
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ID.managerA1]);
      return ids(tx, salarySql);
    });
    expect(seen).toEqual([ID.rishabh, ID.rajeev].sort());
  });

  it("nobody in the browser can read the bank account ciphertext", async () => {
    await expect(
      asUser(db, ID.ownerA, (tx) => tx.query(`select account_number_enc from public.staff_bank_accounts`)),
    ).rejects.toThrow(/permission denied/);
    const { rows } = await asUser(db, ID.ownerA, (tx) =>
      tx.query<{ account_last4: string }>(`select account_last4 from public.staff_bank_accounts`),
    );
    expect(rows).toEqual([{ account_last4: "4321" }]);
  });
});

describe("team RLS: writes", () => {
  it("managers can't turn on a phone login from the browser", async () => {
    await expect(
      asUser(db, ID.managerA1, (tx) =>
        tx.query(`update public.staff_profiles set login_enabled = true where staff_id = $1`, [ID.rajeev]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("managers can edit profile details at their outlet only", async () => {
    const updated = await asUser(db, ID.managerA1, async (tx) => {
      const mine = await tx.query(`update public.staff_profiles set uan = '100200300400' where staff_id = $1`, [ID.rajeev]);
      const other = await tx.query(`update public.staff_profiles set uan = '100200300400' where staff_id = $1`, [ID.bina]);
      return [mine.affectedRows, other.affectedRows];
    });
    expect(updated).toEqual([1, 0]);
  });

  it("staff and tablets can't write rosters", async () => {
    for (const user of [ID.staffUserRishabh, ID.deviceA1]) {
      await expect(
        asUser(db, user, (tx) =>
          tx.query(
            `insert into public.roster_entries (outlet_id, staff_id, business_date, segments)
             values ($1, $2, '2026-11-27', '[{"start":"12:00","end":"21:00"}]')`,
            [ID.outletA1, ID.rishabh],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    }
  });

  it("outlet_id always follows the staff member, whatever the caller sends", async () => {
    const outlet = await asUser(db, ID.ownerA, async (tx) => {
      await tx.query(
        `insert into public.roster_entries (outlet_id, staff_id, business_date, segments)
         values ($1, $2, '2026-11-28', '[{"start":"12:00","end":"21:00"}]')`,
        [ID.outletA2, ID.rishabh],
      );
      const { rows } = await tx.query<{ outlet_id: string }>(
        `select outlet_id from public.roster_entries where staff_id = $1 and business_date = '2026-11-28'`,
        [ID.rishabh],
      );
      return rows[0].outlet_id;
    });
    expect(outlet).toBe(ID.outletA1);
  });

  it("ledgers and attendance can't be written from the browser", async () => {
    await expect(
      asUser(db, ID.ownerA, (tx) =>
        tx.query(
          `insert into public.gullak_ledger (staff_id, outlet_id, business_date, kind, amount_paise)
           values ($1, $2, '2026-11-26', 'credit_payable', 2000)`,
          [ID.rishabh, ID.outletA1],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("audit log and payroll lock", () => {
  it("records who changed a setting, with before and after", async () => {
    const rows = await asUser(db, ID.managerA1, async (tx) => {
      await tx.query(
        `insert into public.outlet_settings (outlet_id, key, value) values ($1, 'attendance.grace_minutes', '10')`,
        [ID.outletA1],
      );
      await tx.query(
        `update public.outlet_settings set value = '15' where outlet_id = $1 and key = 'attendance.grace_minutes'`,
        [ID.outletA1],
      );
      const { rows } = await tx.query<{ action: string; actor: string; before: unknown; after: { value: number } }>(
        `select action, actor, before, after from public.audit_log
          where table_name = 'outlet_settings' order by id`,
      );
      return rows;
    });
    expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(rows.every((r) => r.actor === ID.managerA1)).toBe(true);
    expect(rows[1].after.value).toBe(15);
  });

  it("never copies the bank ciphertext into the audit trail", async () => {
    const { rows } = await db.query<{ after: Record<string, unknown> }>(
      `select after from public.audit_log where table_name = 'staff_bank_accounts'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].after).not.toHaveProperty("account_number_enc");
  });

  it("a locked payroll run can't change", async () => {
    await db.exec(`
      insert into public.payroll_runs (id, outlet_id, period_month, status)
      values ('99000000-0000-0000-0000-000000000001', '${ID.outletA1}', '2026-10-01', 'draft');
      insert into public.payroll_lines (payroll_run_id, staff_id, outlet_id, component_code, kind, amount_paise)
      values ('99000000-0000-0000-0000-000000000001', '${ID.rishabh}', '${ID.outletA1}', 'basic', 'earning', 1400000);
      update public.payroll_runs set status = 'locked' where id = '99000000-0000-0000-0000-000000000001';
    `);
    await expect(
      db.query(`update public.payroll_lines set amount_paise = 1 where payroll_run_id = '99000000-0000-0000-0000-000000000001'`),
    ).rejects.toThrow(/locked/);
    await expect(
      db.query(`update public.payroll_runs set status = 'draft' where id = '99000000-0000-0000-0000-000000000001'`),
    ).rejects.toThrow(/locked/);
  });
});
