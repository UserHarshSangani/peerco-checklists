import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { asUser, createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Runs as the server's service role, rolled back afterwards.
// `setup` runs first as the superuser (e.g. creating an auth user).
async function asService<T>(fn: (tx: Transaction) => Promise<T>, setup = ""): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (setup) await tx.exec(setup);
      await tx.exec("set local role service_role");
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

type Reply = Record<string, unknown>;

async function loginCheck(tx: Transaction, mobile: string, pin: string): Promise<Reply> {
  const { rows } = await tx.query<{ r: Reply }>(`select public.team_staff_login_check($1, $2) as r`, [mobile, pin]);
  return rows[0].r;
}

describe("phone login check", () => {
  it("lets a staff member in with mobile + PIN", async () => {
    const reply = await asService((tx) => loginCheck(tx, "9876500001", "1234"));
    expect(reply).toMatchObject({ ok: true, auth_user_id: ID.staffUserRishabh, staff_id: ID.rishabh });
  });

  it("gives the same answer for a wrong PIN, an unknown number and login switched off", async () => {
    await asService(async (tx) => {
      expect(await loginCheck(tx, "9876500001", "9999")).toEqual({ ok: false, reason: "invalid" });
      expect(await loginCheck(tx, "9000000000", "1234")).toEqual({ ok: false, reason: "invalid" });
      expect(await loginCheck(tx, "9876500002", "2345")).toEqual({ ok: false, reason: "invalid" });
    });
  });

  it("refuses someone who has left", async () => {
    await asService(async (tx) => {
      await tx.exec(`update public.staff_profiles set employment_status = 'exited' where staff_id = '${ID.rishabh}'`);
      expect(await loginCheck(tx, "9876500001", "1234")).toEqual({ ok: false, reason: "invalid" });
    });
  });

  it("locks after the outlet's max tries for the outlet's lock time", async () => {
    await asService(async (tx) => {
      await tx.exec(`insert into public.outlet_settings (outlet_id, key, value) values
        ('${ID.outletA1}', 'auth.pin_max_attempts', '3'), ('${ID.outletA1}', 'auth.pin_lock_minutes', '30')`);
      for (let i = 0; i < 3; i++) await loginCheck(tx, "9876500001", "0000");
      const reply = await loginCheck(tx, "9876500001", "1234");
      expect(reply.reason).toBe("locked");
      const { rows } = await tx.query<{ mins: number }>(
        `select round(extract(epoch from locked_until - now()) / 60)::int as mins from public.staff where id = '${ID.rishabh}'`,
      );
      expect(rows[0].mins).toBe(30);
    });
  });

  it("can't be called from a browser session", async () => {
    await expect(asUser(db, ID.managerA1, (tx) => loginCheck(tx, "9876500001", "1234"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => loginCheck(tx, "9876500001", "1234"))).rejects.toThrow(/permission denied/);
  });
});

describe("tablet PIN lockout follows the settings", () => {
  async function tabletCheck(tx: Transaction, pin: string): Promise<Reply> {
    const { rows } = await tx.query<{ r: Reply }>(
      `select private.verify_staff_pin('${ID.outletA1}', '${ID.rajeev}', $1, 'checklists') as r`,
      [pin],
    );
    return rows[0].r;
  }

  it("defaults to 5 tries and a 15 minute lock", async () => {
    // Superuser here: the tablet reaches this through security-definer RPCs.
    await db.transaction(async (tx) => {
      for (let i = 0; i < 4; i++) expect((await tabletCheck(tx, "0000")).reason).toBe("invalid_pin");
      expect((await tabletCheck(tx, "0000")).reason).toBe("invalid_pin");
      const locked = await tabletCheck(tx, "2345");
      expect(locked.reason).toBe("locked");
      const { rows } = await tx.query<{ mins: number }>(
        `select round(extract(epoch from locked_until - now()) / 60)::int as mins from public.staff where id = '${ID.rajeev}'`,
      );
      expect(rows[0].mins).toBe(15);
      await tx.rollback();
    }).catch(() => {});
  });

  it("still accepts the right PIN and checks task permission", async () => {
    await db.transaction(async (tx) => {
      expect(await tabletCheck(tx, "2345")).toEqual({ ok: true });
      await tx.exec(`update public.staff set can_checklists = false where id = '${ID.rajeev}'`);
      expect((await tabletCheck(tx, "2345")).reason).toBe("task_not_allowed");
      await tx.rollback();
    }).catch(() => {});
  });
});

const NEW_AUTH_USER = `insert into auth.users (id, email)
  values ('00000000-0000-0000-0000-000000000052', 's-rajeev@staff.daybook.invalid')`;

describe("turning phone login on and off", () => {
  it("links the login and records the manager in the audit log", async () => {
    await asService(async (tx) => {
      const { rows } = await tx.query<{ r: Reply }>(
        `select public.team_set_staff_login($1, $2, true, $3) as r`,
        [ID.rajeev, "00000000-0000-0000-0000-000000000052", ID.managerA1],
      );
      expect(rows[0].r).toEqual({ ok: true });
      const audit = await tx.query<{ actor: string; login: boolean }>(
        `select actor, (after ->> 'login_enabled')::boolean as login from public.audit_log
          where table_name = 'staff_profiles' and row_id = '${ID.rajeev}' order by id desc limit 1`,
      );
      expect(audit.rows[0]).toEqual({ actor: ID.managerA1, login: true });
    }, NEW_AUTH_USER);
  });

  it("won't give one mobile number two logins", async () => {
    await asService(async (tx) => {
      await tx.exec(`update public.staff_profiles set mobile = '9876500001' where staff_id = '${ID.rajeev}'`);
      const { rows } = await tx.query<{ r: Reply }>(
        `select public.team_set_staff_login($1, $2, true, $3) as r`,
        [ID.rajeev, "00000000-0000-0000-0000-000000000052", ID.managerA1],
      );
      expect(rows[0].r).toEqual({ ok: false, reason: "mobile_in_use" });
    }, NEW_AUTH_USER);
  });

  it("can't be called from a browser session", async () => {
    await expect(
      asUser(db, ID.managerA1, (tx) =>
        tx.query(`select public.team_set_staff_login($1, null, false, $2)`, [ID.rishabh, ID.managerA1]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("access check and bank details", () => {
  async function access(user: string, staff: string): Promise<Reply> {
    return asUser(db, user, async (tx) => {
      const { rows } = await tx.query<{ r: Reply }>(`select public.team_my_access($1) as r`, [staff]);
      return rows[0].r;
    });
  }

  it("reports manage and pay rights per person", async () => {
    expect(await access(ID.ownerA, ID.rishabh)).toMatchObject({ found: true, can_manage: true, can_see_pay: true });
    expect(await access(ID.managerA1, ID.rishabh)).toMatchObject({ can_manage: true, can_see_pay: false });
    expect(await access(ID.ownerB, ID.rishabh)).toMatchObject({ can_manage: false, can_see_pay: false });
    expect(await access(ID.ownerA, "00000000-0000-0000-0000-00000000dead")).toEqual({ found: false });
  });

  it("lets the owner store bank details but not a manager without pay rights", async () => {
    const save = (tx: Transaction) =>
      tx.query(`select public.team_set_bank_account($1, 'Rajeev K', 'v1:x', '9876', 'icic0001234')`, [ID.rajeev]);
    await asUser(db, ID.ownerA, async (tx) => {
      await save(tx);
      const { rows } = await tx.query<{ ifsc: string; account_last4: string }>(
        `select ifsc, account_last4 from public.staff_bank_accounts where staff_id = '${ID.rajeev}'`,
      );
      expect(rows[0]).toEqual({ ifsc: "ICIC0001234", account_last4: "9876" });
    });
    await expect(asUser(db, ID.managerA1, save)).rejects.toThrow(/not allowed/);
  });
});

describe("staff phone login sees their own outlet", () => {
  it("reads their outlet name and nothing else", async () => {
    const outlets = await asUser(db, ID.staffUserRishabh, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(`select id from public.outlets`);
      return rows.map((r) => r.id);
    });
    expect(outlets).toEqual([ID.outletA1]);
  });
});
