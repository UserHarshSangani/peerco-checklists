import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Rishabh (outlet A1) has a phone login; Rajeev (A1) doesn't.

/** Runs `setup` as the superuser, then `fn` as `userId` (or the superuser when null). Always rolled back. */
async function run<T>(userId: string | null, fn: (tx: Transaction) => Promise<T>, setup = ""): Promise<T> {
  let result: T | undefined;
  let failure: unknown;
  await db
    .transaction(async (tx) => {
      if (setup) await tx.exec(setup);
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

type Reply = { ok: boolean; reason?: string; request_id?: string };

const save = (tx: Transaction, over: Partial<Record<string, string | null>> = {}) => {
  const v = {
    gender: "male",
    dob: "1998-04-12",
    address: "12 MG Road, Pune",
    ename: "Asha",
    ephone: "98765 43210",
    uan: "1001 2345 6789",
    esic: "3112345678",
    photo: null,
    ...over,
  };
  return tx
    .query<{ r: Reply }>(`select public.team_update_my_profile($1, $2::date, $3, $4, $5, $6, $7, $8) as r`, [
      v.gender, v.dob, v.address, v.ename, v.ephone, v.uan, v.esic, v.photo,
    ])
    .then((q) => q.rows[0].r);
};

describe("staff edit their own details", () => {
  it("saves cleaned values to their own profile and tells the managers", async () => {
    const out = await run(ID.staffUserRishabh, async (tx) => {
      const r = await save(tx);
      await tx.exec("reset role");
      const p = await tx.query(
        `select gender, date_of_birth::text dob, address, emergency_contact_name, emergency_contact_phone, uan, esic_ip_number
           from public.staff_profiles where staff_id = '${ID.rishabh}'`,
      );
      const n = await tx.query<{ c: number }>(
        `select count(*)::int c from public.notifications where kind = 'staff_profile_updated' and outlet_id = '${ID.outletA1}'`,
      );
      return { r, p: p.rows[0], n: n.rows[0].c };
    });
    expect(out.r).toEqual({ ok: true });
    expect(out.p).toEqual({
      gender: "male",
      dob: "1998-04-12",
      address: "12 MG Road, Pune",
      emergency_contact_name: "Asha",
      emergency_contact_phone: "9876543210",
      uan: "100123456789",
      esic_ip_number: "3112345678",
    });
    expect(out.n).toBe(2); // manager A1 + owner A
  });

  it("rejects bad values with a reason", async () => {
    const cases: [Record<string, string>, string][] = [
      [{ gender: "x" }, "bad_gender"],
      [{ dob: "2020-01-01" }, "bad_dob"],
      [{ ephone: "12345" }, "bad_phone"],
      [{ uan: "123" }, "bad_uan"],
      [{ esic: "99" }, "bad_esic"],
      [{ photo: `${ID.outletA1}/${ID.rajeev}/x.jpg` }, "bad_photo"],
      [{ photo: `${ID.outletA1}/${ID.rishabh}/missing.jpg` }, "bad_photo"],
    ];
    for (const [over, reason] of cases) {
      const r = await run(ID.staffUserRishabh, (tx) => save(tx, over));
      expect(r, JSON.stringify(over)).toEqual({ ok: false, reason });
    }
  });

  it("accepts a photo they uploaded under their own folder", async () => {
    const path = `${ID.outletA1}/${ID.rishabh}/me.jpg`;
    const out = await run(
      ID.staffUserRishabh,
      async (tx) => {
        const r = await save(tx, { photo: path });
        await tx.exec("reset role");
        const p = await tx.query<{ photo_path: string }>(`select photo_path from public.staff_profiles where staff_id = '${ID.rishabh}'`);
        return { r, photo: p.rows[0].photo_path };
      },
      `insert into storage.objects (bucket_id, name) values ('staff-photos', '${path}');`,
    );
    expect(out).toEqual({ r: { ok: true }, photo: path });
  });

  it("is refused for people without a staff login", async () => {
    expect(await run(ID.managerA1, (tx) => save(tx))).toEqual({ ok: false, reason: "not_allowed" });
  });

  it("can't touch columns outside their own self-service set directly", async () => {
    const affected = await run(ID.staffUserRishabh, async (tx) => {
      const r = await tx.query(`update public.staff_profiles set wage_type = 'daily' where staff_id = '${ID.rishabh}'`);
      return r.affectedRows;
    });
    expect(affected).toBe(0);
  });
});

describe("staff photo storage", () => {
  const insert = (who: string, staff: string) =>
    run(who, async (tx) => {
      try {
        await tx.query(`insert into storage.objects (bucket_id, name) values ('staff-photos', '${ID.outletA1}/${staff}/p.jpg')`);
        return "ok";
      } catch (e) {
        return (e as Error).message;
      }
    });

  it("lets a person upload their own photo, not a colleague's", async () => {
    expect(await insert(ID.staffUserRishabh, ID.rishabh)).toBe("ok");
    expect(await insert(ID.staffUserRishabh, ID.rajeev)).toMatch(/row-level security/);
  });

  it("lets the outlet tablet see staff photos", async () => {
    const seen = await run(
      ID.deviceA1,
      async (tx) => (await tx.query(`select name from storage.objects where bucket_id = 'staff-photos'`)).rows.length,
      `insert into storage.objects (bucket_id, name) values ('staff-photos', '${ID.outletA1}/${ID.rajeev}/p.jpg');`,
    );
    expect(seen).toBe(1);
  });
});

describe("bank change requests", () => {
  const request = `select public.team_request_bank_change('${ID.rishabh}', 'Rishabh K', 'cipher-new', '9876', 'sbin0004567') as r;`;

  it("is filed by the server only, and waits for a pay approver", async () => {
    const out = await run(null, async (tx) => {
      const r = (await tx.query<{ r: Reply }>(request)).rows[0].r;
      const req = await tx.query(`select status, ifsc, account_last4 from public.staff_bank_change_requests where id = '${r.request_id}'`);
      const notified = await tx.query<{ recipient_profile_id: string }>(
        `select recipient_profile_id from public.notifications where kind = 'bank_change_requested'`,
      );
      const bank = await tx.query<{ account_last4: string }>(`select account_last4 from public.staff_bank_accounts where staff_id = '${ID.rishabh}'`);
      return { ok: r.ok, req: req.rows[0], notified: notified.rows.map((n) => n.recipient_profile_id), bank: bank.rows[0]?.account_last4 !== "9876" };
    });
    expect(out).toEqual({
      ok: true,
      req: { status: "pending", ifsc: "SBIN0004567", account_last4: "9876" },
      notified: [ID.ownerA], // managers can't see pay by default
      bank: true, // the current account is untouched until approved
    });
  });

  it("can't be filed from the browser", async () => {
    await expect(run(ID.staffUserRishabh, (tx) => tx.query(request))).rejects.toThrow(/permission denied/);
  });

  it("a newer request replaces one still waiting", async () => {
    const statuses = await run(null, async (tx) => {
      await tx.query(request);
      await tx.query(request);
      return (await tx.query<{ status: string }>(`select status from public.staff_bank_change_requests order by requested_at, status`)).rows.map(
        (r) => r.status,
      );
    });
    expect(statuses.sort()).toEqual(["cancelled", "pending"]);
  });

  it("the owner approves it into the bank account; the staff member never sees the ciphertext", async () => {
    const out = await run(
      ID.ownerA,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.staff_bank_change_requests limit 1`)).rows[0].id;
        const r = (await tx.query<{ r: Reply }>(`select public.team_decide_bank_change('${id}', true) as r`)).rows[0].r;
        const bank = await tx.query(`select account_last4, ifsc from public.staff_bank_accounts where staff_id = '${ID.rishabh}'`);
        const status = await tx.query(`select status from public.staff_bank_change_requests where id = '${id}'`);
        return { r, bank: bank.rows[0], status: status.rows[0] };
      },
      request,
    );
    expect(out).toEqual({ r: { ok: true }, bank: { account_last4: "9876", ifsc: "SBIN0004567" }, status: { status: "approved" } });

    const own = await run(
      ID.staffUserRishabh,
      async (tx) => {
        const visible = (await tx.query(`select status, account_last4 from public.staff_bank_change_requests`)).rows.length;
        let enc = "ok";
        try {
          await tx.query(`select account_number_enc from public.staff_bank_change_requests`);
        } catch (e) {
          enc = (e as Error).message;
        }
        return { visible, enc };
      },
      request,
    );
    expect(own.visible).toBe(1);
    expect(own.enc).toMatch(/permission denied/);
  });

  it("a manager without pay access can't decide; rejecting needs a note", async () => {
    const asManager = run(
      ID.managerA1,
      async (tx) => (await tx.query<{ id: string }>(`select id from public.staff_bank_change_requests`)).rows[0]?.id ?? "invisible",
      request,
    );
    expect(await asManager).toBe("invisible");

    const reject = await run(
      ID.ownerA,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.staff_bank_change_requests limit 1`)).rows[0].id;
        const noNote = (await tx.query<{ r: Reply }>(`select public.team_decide_bank_change('${id}', false) as r`)).rows[0].r;
        const withNote = (await tx.query<{ r: Reply }>(`select public.team_decide_bank_change('${id}', false, 'Wrong IFSC') as r`)).rows[0].r;
        const last4 = (await tx.query<{ account_last4: string }>(`select account_last4 from public.staff_bank_accounts where staff_id = '${ID.rishabh}'`)).rows[0]?.account_last4;
        return { noNote, withNote, bank: last4 !== "9876" };
      },
      request,
    );
    expect(reject).toEqual({ noNote: { ok: false, reason: "note_required" }, withNote: { ok: true }, bank: true });
  });
});
