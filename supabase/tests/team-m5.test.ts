import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Fixtures: Rishabh (A1, phone login) joined 2026-06-01; Rajeev (A1) joined 2026-08-15.
// On 2026-11-26 Rishabh is rostered 12:00–21:00, Rajeev 14:00–23:00.

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

type Reply = { ok: boolean; reason?: string; request_id?: string; paid_minutes?: number; unpaid_minutes?: number };

const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const typeId = (code: string, outlet: string = ID.outletA1) =>
  `(select id from public.leave_types where outlet_id = '${outlet}' and code = '${code}')`;

const credit = (staff: string, code: string, minutes: number) =>
  `insert into public.leave_ledger (staff_id, leave_type_id, delta_minutes, reason) values ('${staff}', ${typeId(code)}, ${minutes}, 'opening');`;

async function ask(tx: Transaction, code: string, from: string, to: string, leavingAt: string | null = null, proof: string | null = null) {
  const { rows } = await tx.query<{ r: Reply }>(
    `select public.team_request_leave(${typeId(code)}, $1::date, $2::date, $3::time, 'Family function', $4) as r`,
    [from, to, leavingAt, proof],
  );
  return rows[0].r;
}

const balance = async (tx: Transaction, staff: string, code: string) =>
  (await tx.query<{ b: number }>(`select coalesce(sum(delta_minutes), 0)::int b from public.leave_ledger where staff_id = '${staff}' and leave_type_id = ${typeId(code)}`)).rows[0].b;

const approved = (staff: string, code: string, from: string, to: string, extra = "") =>
  `insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, status, paid_minutes, unpaid_minutes ${extra ? ", leaving_at" : ""})
   values ('${staff}', ${typeId(code)}, '${from}', '${to}', 'approved', 480, 0 ${extra ? `, '${extra}'` : ""});`;

describe("leave types", () => {
  it("every outlet gets CL 8, SL 7, EL 15, comp-off and unpaid", async () => {
    const rows = await run(null, async (tx) =>
      (await tx.query<{ code: string; paid: boolean; days: number; carry: number | null }>(
        `select code, paid, (accrual->>'per_year_days')::int days, (accrual->>'carry_forward_max_days')::int carry
           from public.leave_types where outlet_id = '${ID.outletA1}' order by code`,
      )).rows,
    );
    expect(rows).toEqual([
      { code: "cl", paid: true, days: 8, carry: 0 },
      { code: "comp_off", paid: true, days: 0, carry: null },
      { code: "el", paid: true, days: 15, carry: 30 },
      { code: "sl", paid: true, days: 7, carry: 0 },
      { code: "unpaid", paid: false, days: 0, carry: null },
    ]);
  });

  it("staff see their own outlet's types only; they can't edit them", async () => {
    const out = await run(ID.staffUserRishabh, async (tx) => {
      const outlets = (await tx.query<{ outlet_id: string }>(`select distinct outlet_id from public.leave_types`)).rows;
      const upd = await tx.query(`update public.leave_types set name = 'x'`);
      return { outlets: outlets.map((o) => o.outlet_id), updated: upd.affectedRows };
    });
    expect(out).toEqual({ outlets: [ID.outletA1], updated: 0 });
  });
});

describe("monthly accrual", () => {
  const leaveRun = (tx: Transaction, at: string) =>
    tx.query<{ r: { credits: number; lapses: number } }>(`select private.team_leave_run($1) as r`, [at]).then((q) => q.rows[0].r);

  it("credits 1/12 for the month just finished, once probation is over, and only once", async () => {
    const out = await run(null, async (tx) => {
      const first = await leaveRun(tx, "2026-10-01T00:30:00+05:30");
      const again = await leaveRun(tx, "2026-10-02T00:30:00+05:30");
      const rows = (await tx.query<{ staff_id: string; code: string; delta_minutes: number; period: string }>(
        `select l.staff_id, t.code, l.delta_minutes, l.period::text from public.leave_ledger l
           join public.leave_types t on t.id = l.leave_type_id order by t.code`,
      )).rows;
      return { first, again, rows };
    });
    expect(out.first.credits).toBe(3);
    expect(out.again.credits).toBe(0);
    // Rishabh joined 1 June: probation over 1 September. Rajeev (joined 15 Aug) isn't due yet.
    expect(out.rows).toEqual([
      { staff_id: ID.rishabh, code: "cl", delta_minutes: 320, period: "2026-09-01" },
      { staff_id: ID.rishabh, code: "el", delta_minutes: 600, period: "2026-09-01" },
      { staff_id: ID.rishabh, code: "sl", delta_minutes: 280, period: "2026-09-01" },
    ]);
  });

  it("follows the outlet's probation setting and skips people who have left", async () => {
    const out = await run(
      null,
      async (tx) => {
        await leaveRun(tx, "2026-11-01T00:30:00+05:30");
        return (await tx.query<{ staff_id: string }>(`select distinct staff_id from public.leave_ledger where outlet_id = '${ID.outletA1}'`)).rows.map((r) => r.staff_id);
      },
      `insert into public.outlet_settings (outlet_id, key, value) values ('${ID.outletA1}', 'leave.probation_months', '1');
       update public.staff_profiles set employment_status = 'exited' where staff_id = '${ID.rishabh}';`,
    );
    // October: Rajeev's one-month probation ended 15 Sep, so he earns; Rishabh has left.
    expect(out).toEqual([ID.rajeev]);
  });
});

describe("year end", () => {
  it("EL carries up to 30 days, CL and SL lapse, comp-off carries; once per outlet", async () => {
    const out = await run(
      null,
      async (tx) => {
        const first = await tx.query<{ r: { lapses: number } }>(`select private.team_leave_run('2027-04-01T00:30:00+05:30') as r`);
        const again = await tx.query<{ r: { lapses: number } }>(`select private.team_leave_run('2027-04-02T00:30:00+05:30') as r`);
        const lapses = (await tx.query<{ code: string; delta_minutes: number }>(
          `select t.code, l.delta_minutes from public.leave_ledger l join public.leave_types t on t.id = l.leave_type_id
            where l.reason = 'lapse' and l.staff_id = '${ID.rishabh}' order by t.code`,
        )).rows;
        return { first: first.rows[0].r.lapses, again: again.rows[0].r.lapses, lapses, el: await balance(tx, ID.rishabh, "el") };
      },
      credit(ID.rishabh, "el", 40 * 480) + credit(ID.rishabh, "cl", 5 * 480) + credit(ID.rishabh, "comp_off", 3 * 480),
    );
    // March's credit (EL 600, CL 320, SL 280) is posted first, then the year closes.
    expect(out.lapses).toEqual([
      { code: "cl", delta_minutes: -(5 * 480 + 320) },
      { code: "el", delta_minutes: -(10 * 480 + 600) },
      { code: "sl", delta_minutes: -280 },
    ]);
    expect(out.el).toBe(30 * 480);
    expect(out.again).toBe(0);
  });

  it("does nothing outside the first month of the year, or for the year an outlet started in", async () => {
    const out = await run(
      null,
      async (tx) => {
        await tx.query(`select private.team_leave_run('2027-05-03T00:30:00+05:30')`);
        await tx.query(`select private.team_leave_run('2026-11-28T00:30:00+05:30')`);
        return (await tx.query<{ c: number }>(`select count(*)::int c from public.leave_ledger where reason = 'lapse'`)).rows[0].c;
      },
      credit(ID.rishabh, "cl", 5 * 480),
    );
    expect(out).toBe(0);
  });
});

describe("asking for leave", () => {
  const far = () => plusDays(todayIST(), 30);

  it("files a request, counts the days and tells the managers", async () => {
    const out = await run(ID.staffUserRishabh, async (tx) => {
      const r = await ask(tx, "cl", far(), plusDays(far(), 2));
      await tx.exec("reset role");
      const req = (await tx.query(`select status, requested_minutes, outlet_id from public.leave_requests where id = '${r.request_id}'`)).rows[0];
      const n = (await tx.query<{ c: number }>(`select count(*)::int c from public.notifications where kind = 'leave_requested'`)).rows[0].c;
      return { ok: r.ok, req, n };
    });
    expect(out).toEqual({ ok: true, req: { status: "pending", requested_minutes: 1440, outlet_id: ID.outletA1 }, n: 2 });
  });

  it("checks notice, dates, proof, overlaps and weekly offs", async () => {
    const today = todayIST();
    const proof = `${ID.outletA1}/${ID.rishabh}/sick.jpg`;
    const out = await run(
      ID.staffUserRishabh,
      async (tx) => {
        const results: Record<string, Reply> = {};
        results.shortNotice = await ask(tx, "cl", plusDays(today, 1), plusDays(today, 1));
        results.past = await ask(tx, "sl", plusDays(today, -1), plusDays(today, -1));
        results.backwards = await ask(tx, "cl", far(), plusDays(far(), -1));
        results.halfMulti = await ask(tx, "cl", far(), plusDays(far(), 1), "19:00");
        results.sickToday = await ask(tx, "sl", today, today);
        results.sickLong = await ask(tx, "sl", plusDays(today, 3), plusDays(today, 5));
        results.sickLongProof = await ask(tx, "sl", plusDays(today, 3), plusDays(today, 5), null, proof);
        results.badProof = await ask(tx, "sl", plusDays(today, 10), plusDays(today, 12), null, `${ID.outletA1}/${ID.rajeev}/x.jpg`);
        results.overlap = await ask(tx, "cl", plusDays(today, 4), plusDays(today, 4));
        results.weeklyOff = await ask(tx, "cl", plusDays(today, 20), plusDays(today, 20));
        return results;
      },
      `insert into storage.objects (bucket_id, name) values ('staff-documents', '${proof}');
       insert into public.roster_entries (outlet_id, staff_id, business_date, kind, segments, source)
       values ('${ID.outletA1}', '${ID.rishabh}', '${plusDays(today, 20)}', 'weekly_off', '[]', 'seed');`,
    );
    expect(out.shortNotice).toEqual({ ok: false, reason: "short_notice", notice_days: 2 });
    expect(out.past.reason).toBe("past_date");
    expect(out.backwards.reason).toBe("bad_dates");
    expect(out.halfMulti.reason).toBe("bad_dates");
    expect(out.sickToday.ok).toBe(true);
    expect(out.sickLong.reason).toBe("proof_required");
    expect(out.sickLongProof.ok).toBe(true);
    expect(out.badProof.reason).toBe("bad_proof");
    expect(out.overlap.reason).toBe("overlaps");
    expect(out.weeklyOff.reason).toBe("no_working_days");
  });

  it("tells the phone the notice period and day length", async () => {
    expect(await run(ID.staffUserRishabh, async (tx) => (await tx.query(`select public.team_my_leave_settings() as s`)).rows[0])).toEqual({
      s: { notice_days: 2, day_minutes: 480 },
    });
    expect(await run(ID.managerA1, async (tx) => (await tx.query(`select public.team_my_leave_settings() as s`)).rows[0])).toEqual({ s: null });
  });

  it("is only for people with a staff login, and only through the function", async () => {
    expect(await run(ID.managerA1, (tx) => ask(tx, "cl", far(), far()))).toEqual({ ok: false, reason: "not_allowed" });
    await expect(
      run(ID.staffUserRishabh, (tx) =>
        tx.query(`insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date) values ('${ID.rishabh}', ${typeId("cl")}, '2027-01-01', '2027-01-01')`),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(run(ID.staffUserRishabh, (tx) => tx.query(credit(ID.rishabh, "cl", 4800)))).rejects.toThrow(/permission denied/);
  });
});

describe("approving and rejecting", () => {
  const far = () => plusDays(todayIST(), 30);
  const fileRequest = () =>
    `select set_config('request.jwt.claim.sub', '${ID.staffUserRishabh}', true);
     set local role authenticated;
     select public.team_request_leave(${typeId("cl")}, '${far()}', '${plusDays(far(), 2)}', null, null, null);
     reset role;`;

  it("pays what the balance covers, the rest is unpaid, and tells the person", async () => {
    const out = await run(
      ID.managerA1,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.leave_requests`)).rows[0].id;
        const r = (await tx.query<{ r: Reply }>(`select public.team_decide_leave('${id}', true, null, '[{"date":"x"}]') as r`)).rows[0].r;
        const again = (await tx.query<{ r: Reply }>(`select public.team_decide_leave('${id}', true) as r`)).rows[0].r;
        await tx.exec("reset role");
        const req = (await tx.query(`select status, paid_minutes, unpaid_minutes, impact_snapshot from public.leave_requests where id = '${id}'`)).rows[0];
        const toStaff = (await tx.query<{ c: number }>(`select count(*)::int c from public.notifications where kind = 'leave_decided' and recipient_profile_id = '${ID.staffUserRishabh}'`)).rows[0].c;
        const unread = (await tx.query<{ c: number }>(`select count(*)::int c from public.notifications where kind = 'leave_requested' and read_at is null`)).rows[0].c;
        return { r, again, req, bal: await balance(tx, ID.rishabh, "cl"), toStaff, unread };
      },
      credit(ID.rishabh, "cl", 600) + fileRequest(),
    );
    expect(out.r).toEqual({ ok: true, paid_minutes: 600, unpaid_minutes: 840 });
    expect(out.again.reason).toBe("not_pending");
    expect(out.req).toEqual({ status: "approved", paid_minutes: 600, unpaid_minutes: 840, impact_snapshot: [{ date: "x" }] });
    expect(out.bal).toBe(0);
    expect(out.toStaff).toBe(1);
    expect(out.unread).toBe(0);
  });

  it("rejecting needs a reason; other outlets and staff can't decide", async () => {
    const out = await run(
      null,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.leave_requests`)).rows[0].id;
        const as = async (user: string, sql: string) => {
          await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
          await tx.exec("set local role authenticated");
          const r = (await tx.query<{ r: Reply }>(sql)).rows[0].r;
          await tx.exec("reset role");
          return r;
        };
        return {
          ownerB: await as(ID.ownerB, `select public.team_decide_leave('${id}', true) as r`),
          staff: await as(ID.staffUserRishabh, `select public.team_decide_leave('${id}', true) as r`),
          noNote: await as(ID.managerA1, `select public.team_decide_leave('${id}', false) as r`),
          withNote: await as(ID.managerA1, `select public.team_decide_leave('${id}', false, 'Wedding season') as r`),
          status: (await tx.query<{ status: string }>(`select status from public.leave_requests where id = '${id}'`)).rows[0].status,
        };
      },
      fileRequest(),
    );
    expect(out).toEqual({
      ownerB: { ok: false, reason: "bad_request" },
      staff: { ok: false, reason: "bad_request" },
      noNote: { ok: false, reason: "note_required" },
      withNote: { ok: true, paid_minutes: 0, unpaid_minutes: 0 },
      status: "rejected",
    });
  });
});

describe("leave in attendance", () => {
  const D = "2026-11-26";

  it("a full day of approved leave shows as leave, not absent", async () => {
    const out = await run(
      null,
      async (tx) => {
        await tx.query(`select private.team_recompute_day('${ID.rishabh}', '${D}', '2026-11-26T22:00:00+05:30')`);
        return (await tx.query(`select status, leave_request_id is not null as linked from public.attendance_days where staff_id = '${ID.rishabh}' and business_date = '${D}'`)).rows[0];
      },
      approved(ID.rishabh, "cl", D, D),
    );
    expect(out).toEqual({ status: "leave", linked: true });
  });

  it("a half day they worked shows as half day", async () => {
    const out = await run(
      null,
      async (tx) => {
        await tx.query(`select private.team_recompute_day('${ID.rishabh}', '${D}', '2026-11-26T22:00:00+05:30')`);
        return (await tx.query<{ status: string }>(`select status from public.attendance_days where staff_id = '${ID.rishabh}' and business_date = '${D}'`)).rows[0].status;
      },
      approved(ID.rishabh, "cl", D, D, "17:00") +
        `insert into public.attendance_events (outlet_id, staff_id, business_date, kind, at, source) values
           ('${ID.outletA1}', '${ID.rishabh}', '${D}', 'in', '2026-11-26T12:00:00+05:30', 'device'),
           ('${ID.outletA1}', '${ID.rishabh}', '${D}', 'out', '2026-11-26T17:00:00+05:30', 'device');`,
    );
    expect(out).toBe("half_day");
  });

  it("no no-show alert for someone on leave; the sweep fills in their day", async () => {
    const out = await run(
      null,
      async (tx) => {
        await tx.query(`select private.team_attendance_sweep('2026-11-26T13:00:00+05:30')`);
        const alerts = (await tx.query<{ c: number }>(`select count(*)::int c from public.notifications where kind = 'attendance_no_show' and payload->>'staff_id' = '${ID.rishabh}'`)).rows[0].c;
        const day = (await tx.query<{ status: string }>(`select status from public.attendance_days where staff_id = '${ID.rishabh}' and business_date = '${D}'`)).rows[0]?.status;
        return { alerts, day };
      },
      // The fixture roster already worked the day out; start from no summary.
      approved(ID.rishabh, "cl", D, D) + `delete from public.attendance_days where staff_id = '${ID.rishabh}';`,
    );
    expect(out).toEqual({ alerts: 0, day: "leave" });
  });
});

describe("cancelling", () => {
  const today = todayIST();
  const future = plusDays(today, 10);

  it("the person cancels approved leave that hasn't started; the days come back", async () => {
    const out = await run(
      ID.staffUserRishabh,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.leave_requests`)).rows[0].id;
        const r = (await tx.query<{ r: Reply }>(`select public.team_cancel_leave('${id}') as r`)).rows[0].r;
        await tx.exec("reset role");
        const managers = (await tx.query<{ c: number }>(`select count(*)::int c from public.notifications where kind = 'leave_cancelled'`)).rows[0].c;
        return { r, bal: await balance(tx, ID.rishabh, "cl"), managers };
      },
      approved(ID.rishabh, "cl", future, future),
    );
    expect(out).toEqual({ r: { ok: true }, bal: 480, managers: 2 });
  });

  it("once it has started only a manager can cancel it, with a reason", async () => {
    const setup = approved(ID.rishabh, "cl", today, plusDays(today, 1));
    const asStaff = await run(
      ID.staffUserRishabh,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.leave_requests`)).rows[0].id;
        return (await tx.query<{ r: Reply }>(`select public.team_cancel_leave('${id}') as r`)).rows[0].r;
      },
      setup,
    );
    expect(asStaff.reason).toBe("already_started");
    const asManager = await run(
      ID.managerA1,
      async (tx) => {
        const id = (await tx.query<{ id: string }>(`select id from public.leave_requests`)).rows[0].id;
        const noNote = (await tx.query<{ r: Reply }>(`select public.team_cancel_leave('${id}') as r`)).rows[0].r;
        const withNote = (await tx.query<{ r: Reply }>(`select public.team_cancel_leave('${id}', 'Came back early') as r`)).rows[0].r;
        return { noNote, withNote };
      },
      setup,
    );
    expect(asManager).toEqual({ noNote: { ok: false, reason: "note_required" }, withNote: { ok: true } });
  });
});

describe("balance adjustments", () => {
  const adjust = (code: string, minutes: number, note: string | null) =>
    `select public.team_adjust_leave('${ID.rishabh}', ${typeId(code)}, ${minutes}, ${note === null ? "null" : `'${note}'`}) as r`;

  it("managers set opening balances with a reason; never below zero", async () => {
    const out = await run(ID.managerA1, async (tx) => {
      const one = async (sql: string) => (await tx.query<{ r: Reply }>(sql)).rows[0].r;
      return {
        ok: await one(adjust("el", 960, "Opening balance")),
        noNote: await one(adjust("el", 480, " ")),
        below: await one(adjust("el", -2000, "Fix")),
        unpaid: await one(adjust("unpaid", 480, "x")),
        zero: await one(adjust("el", 0, "x")),
      };
    });
    expect(out).toEqual({
      ok: { ok: true },
      noNote: { ok: false, reason: "note_required" },
      below: { ok: false, reason: "below_zero" },
      unpaid: { ok: false, reason: "bad_type" },
      zero: { ok: false, reason: "bad_amount" },
    });
  });

  it("staff and other organisations can't", async () => {
    for (const user of [ID.staffUserRishabh, ID.ownerB]) {
      const r = await run(user, async (tx) => (await tx.query<{ r: Reply }>(adjust("el", 480, "x"))).rows[0].r);
      expect(r, user).toEqual({ ok: false, reason: "bad_request" });
    }
  });
});
