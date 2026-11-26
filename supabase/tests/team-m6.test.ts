import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Fixtures: Rishabh (A1, phone login, basic ₹14,000) and Rajeev (A1, no
// login, basic ₹15,000). Both get the "floor" skill in SKILLS below.

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

/** The error a query raises, without aborting the surrounding transaction. */
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

/** Switch to another signed-in user inside the same transaction. */
async function as(tx: Transaction, userId: string | null) {
  await tx.exec("reset role");
  if (userId) {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec("set local role authenticated");
  }
}

type Reply = { ok: boolean; reason?: string; request_id?: string; offers?: number; skipped?: number; state?: string; comp_off?: boolean };

const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const D = plusDays(todayIST(), 3);
const Y = plusDays(todayIST(), -1);

const SKILLS = `insert into public.staff_skills (staff_id, outlet_id, skill) values
  ('${ID.rishabh}', '${ID.outletA1}', 'floor'), ('${ID.rajeev}', '${ID.outletA1}', 'floor');`;
const setting = (key: string, value: string) =>
  `insert into public.outlet_settings (outlet_id, key, value) values ('${ID.outletA1}', '${key}', '${value}');`;

async function create(tx: Transaction, candidates: string[], opts: { start?: string; end?: string; mode?: string; date?: string } = {}) {
  const { rows } = await tx.query<{ r: Reply }>(
    `select public.team_create_cover($1, $2::date, 'floor', $3::time, $4::time, $5::uuid[], $6, 'Rajeev on leave') as r`,
    [ID.outletA1, opts.date ?? D, opts.start ?? "21:00", opts.end ?? "23:00", candidates, opts.mode ?? null],
  );
  return rows[0].r;
}

/** Reads an offer as the superuser (amounts are hidden from managers), then switches back. */
async function offerFor(tx: Transaction, request: string, staff: string) {
  const who = (await tx.query<{ role: string; sub: string }>(
    `select current_user as role, current_setting('request.jwt.claim.sub', true) as sub`)).rows[0];
  await tx.exec("reset role");
  const row = (await tx.query<{ id: string; wave: number; sent: boolean; response: string | null; amount: number | null }>(
    `select id, wave, sent_at is not null sent, response, offered_ot_paise::int amount from public.cover_offers
      where cover_request_id = $1 and staff_id = $2`, [request, staff],
  )).rows[0];
  if (who.role === "authenticated") await as(tx, who.sub);
  return row;
}

async function respond(tx: Transaction, offer: string, accept: boolean, compOff = false) {
  const { rows } = await tx.query<{ r: Reply }>(`select public.team_respond_cover($1, $2, $3) as r`, [offer, accept, compOff]);
  return rows[0].r;
}

const request = async (tx: Transaction, id: string) =>
  (await tx.query<{ status: string; wave: number; filled_by_staff_id: string | null; escalation_stage: string }>(
    `select status, wave, filled_by_staff_id, escalation_stage from public.cover_requests where id = $1`, [id],
  )).rows[0];

const roster = async (tx: Transaction, staff: string, date: string) =>
  (await tx.query<{ kind: string; segments: unknown; source: string }>(
    `select kind, segments, source from public.roster_entries where staff_id = $1 and business_date = $2`, [staff, date],
  )).rows[0];

const notes = async (tx: Transaction, kind: string) =>
  (await tx.query<{ recipient_profile_id: string; payload: Record<string, unknown> }>(
    `select recipient_profile_id, payload from public.notifications where kind = $1 order by recipient_profile_id`, [kind],
  )).rows;

describe("asking for cover", () => {
  it("the manager sends offers; the first wave goes out with the overtime amount", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rajeev, ID.rishabh]);
      expect(r).toMatchObject({ ok: true, offers: 2, skipped: 0, state: "sent" });
      const rishabh = await offerFor(tx, r.request_id!, ID.rishabh);
      // ₹14,000 ÷ 26 days ÷ 8h = ₹67.31/h; 2h at 2× = ₹269.23.
      expect(rishabh).toMatchObject({ wave: 1, sent: true, response: null, amount: 26923 });
      await as(tx, null);
      const sent = await notes(tx, "cover_offer");
      expect(sent).toHaveLength(1); // Rajeev has no phone login
      expect(sent[0]).toMatchObject({ recipient_profile_id: ID.staffUserRishabh });
      expect(sent[0].payload).toMatchObject({ start: "21:00", end: "23:00", amount_paise: 26923, points: 20 });
    }, SKILLS);
  });

  it("drops people without the skill, on leave, or already working then", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rajeev, ID.rishabh, ID.bina]);
      expect(r).toMatchObject({ ok: true, offers: 0, skipped: 3, state: "escalated" });
    }, `insert into public.staff_skills (staff_id, outlet_id, skill) values ('${ID.rajeev}', '${ID.outletA1}', 'chef'),
                                                                         ('${ID.rishabh}', '${ID.outletA1}', 'floor');
        insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, status)
          values ('${ID.rishabh}', (select id from public.leave_types where outlet_id = '${ID.outletA1}' and code = 'cl'), '${D}', '${D}', 'approved');`);

    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh]);
      expect(r).toMatchObject({ offers: 0, skipped: 1 });
    }, SKILLS + `insert into public.roster_entries (outlet_id, staff_id, business_date, segments, role_skill)
                 values ('${ID.outletA1}', '${ID.rishabh}', '${D}', '[{"start":"18:00","end":"22:00"}]', 'floor');`);
  });

  it("only the outlet's managers can ask, and never by writing the table directly", async () => {
    for (const user of [ID.staffUserRishabh, ID.ownerB, ID.deviceA1]) {
      const r = await run(user, (tx) => create(tx, [ID.rishabh]), SKILLS);
      expect(r).toMatchObject({ ok: false, reason: "not_allowed" });
    }
    await expect(run(ID.managerA1, (tx) => tx.query(
      `insert into public.cover_requests (outlet_id, business_date, role_skill, slot_start, slot_end, mode)
       values ('${ID.outletA1}', '${D}', 'floor', '21:00', '23:00', 'first_accept')`))).rejects.toThrow(/permission denied/);
    const past = await run(ID.managerA1, (tx) => create(tx, [ID.rishabh], { date: Y }), SKILLS);
    expect(past).toMatchObject({ ok: false, reason: "bad_slot" });
  });

  it("refuses a second open request for the same skill and time", async () => {
    await run(ID.managerA1, async (tx) => {
      await create(tx, [ID.rishabh]);
      expect(await create(tx, [ID.rajeev], { start: "22:00", end: "23:30" })).toMatchObject({ ok: false, reason: "duplicate" });
    }, SKILLS);
  });
});

describe("waves", () => {
  it("sends the next person when the first doesn't answer, then alerts the managers", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rajeev, ID.rishabh]);
      expect(await offerFor(tx, r.request_id!, ID.rishabh)).toMatchObject({ wave: 2, sent: false });
      await as(tx, null);
      await tx.query(`select private.team_cover_sweep(now() + interval '31 minutes')`);
      expect(await offerFor(tx, r.request_id!, ID.rajeev)).toMatchObject({ response: "expired" });
      expect(await offerFor(tx, r.request_id!, ID.rishabh)).toMatchObject({ sent: true, response: null });
      await tx.query(`select private.team_cover_sweep(now() + interval '62 minutes')`);
      expect(await request(tx, r.request_id!)).toMatchObject({ status: "escalated", escalation_stage: "manager" });
      expect((await notes(tx, "cover_unfilled")).map((n) => n.recipient_profile_id).sort()).toEqual([ID.ownerA, ID.managerA1].sort());
    }, SKILLS + setting("cover.offer_batch_size", "1"));
  });

  it("a no from everyone in the wave sends the next wave straight away", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh, ID.rajeev]);
      const mine = await offerFor(tx, r.request_id!, ID.rishabh);
      await as(tx, ID.staffUserRishabh);
      expect(await respond(tx, mine.id, false)).toMatchObject({ ok: true, state: "declined" });
      await as(tx, null);
      expect(await offerFor(tx, r.request_id!, ID.rajeev)).toMatchObject({ sent: true });
      expect(await request(tx, r.request_id!)).toMatchObject({ status: "open", wave: 2 });
    }, SKILLS + setting("cover.offer_batch_size", "1"));
  });

  it("expires once the slot has started", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh]);
      await as(tx, null);
      await tx.query(`select private.team_cover_sweep(('${D} 21:01'::timestamp) at time zone 'Asia/Kolkata')`);
      expect(await request(tx, r.request_id!)).toMatchObject({ status: "expired" });
    }, SKILLS);
  });
});

describe("accepting", () => {
  it("first to accept gets it: roster, planned overtime, the others told", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh, ID.rajeev]);
      const mine = await offerFor(tx, r.request_id!, ID.rishabh);
      await as(tx, ID.staffUserRishabh);
      expect(await respond(tx, mine.id, true)).toMatchObject({ ok: true, state: "awarded", comp_off: false });
      expect(await respond(tx, mine.id, true)).toMatchObject({ ok: false, reason: "taken" });
      await as(tx, null);
      expect(await request(tx, r.request_id!)).toMatchObject({ status: "filled", filled_by_staff_id: ID.rishabh });
      expect(await roster(tx, ID.rishabh, D)).toEqual({ kind: "work", segments: [{ start: "21:00", end: "23:00" }], source: "cover" });
      expect(await offerFor(tx, r.request_id!, ID.rajeev)).toMatchObject({ response: "expired" });
      const ot = (await tx.query(`select planned_minutes, amount_paise::int amount, comp_off, status from public.overtime_entries
                                   where cover_request_id = $1`, [r.request_id])).rows;
      expect(ot).toEqual([{ planned_minutes: 120, amount: 26923, comp_off: false, status: "planned" }]);
      expect(await notes(tx, "cover_awarded")).toHaveLength(1);
      expect(await notes(tx, "cover_filled")).toHaveLength(2);
    }, SKILLS);
  });

  it("extends a shift that ends when the slot starts", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh], { start: "19:00", end: "21:00" });
      const mine = await offerFor(tx, r.request_id!, ID.rishabh);
      await as(tx, ID.staffUserRishabh);
      await respond(tx, mine.id, true);
      await as(tx, null);
      expect(await roster(tx, ID.rishabh, D)).toMatchObject({ segments: [{ start: "12:00", end: "21:00" }], source: "manual" });
    }, SKILLS + `insert into public.roster_entries (outlet_id, staff_id, business_date, segments, role_skill)
                 values ('${ID.outletA1}', '${ID.rishabh}', '${D}', '[{"start":"12:00","end":"19:00"}]', 'floor');`);
  });

  it("staff may take comp-off instead of pay, unless the outlet turns that off", async () => {
    const compOff = async (setup: string) =>
      run(ID.managerA1, async (tx) => {
        const r = await create(tx, [ID.rishabh]);
        const mine = await offerFor(tx, r.request_id!, ID.rishabh);
        await as(tx, ID.staffUserRishabh);
        await respond(tx, mine.id, true, true);
        await as(tx, null);
        return (await tx.query<{ comp_off: boolean; amount: number }>(
          `select comp_off, amount_paise::int amount from public.overtime_entries where cover_request_id = $1`, [r.request_id])).rows[0];
      }, SKILLS + setup);
    expect(await compOff("")).toEqual({ comp_off: true, amount: 0 });
    expect(await compOff(setting("cover.staff_may_choose_comp_off", "false"))).toEqual({ comp_off: false, amount: 26923 });
  });

  it("manager-pick: a yes waits for the manager, who keeps their comp-off choice", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh, ID.rajeev], { mode: "manager_pick" });
      const mine = await offerFor(tx, r.request_id!, ID.rishabh);
      await as(tx, ID.staffUserRishabh);
      expect(await respond(tx, mine.id, true, true)).toMatchObject({ ok: true, state: "waiting_for_manager" });
      expect((await tx.query<{ r: Reply }>(`select public.team_award_cover($1, $2) r`, [r.request_id, ID.rishabh])).rows[0].r)
        .toMatchObject({ ok: false, reason: "not_allowed" });
      await as(tx, null);
      expect(await notes(tx, "cover_accepted")).toHaveLength(2);
      await tx.query(`select private.team_cover_sweep(now() + interval '31 minutes')`);
      expect(await request(tx, r.request_id!)).toMatchObject({ status: "open" }); // waits, no escalation
      await as(tx, ID.managerA1);
      expect((await tx.query<{ r: Reply }>(`select public.team_award_cover($1, $2) r`, [r.request_id, ID.rishabh])).rows[0].r)
        .toMatchObject({ ok: true, comp_off: true });
    }, SKILLS);
  });

  it("cancelling a filled cover needs a reason and puts the roster back", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh]);
      const mine = await offerFor(tx, r.request_id!, ID.rishabh);
      await as(tx, ID.staffUserRishabh);
      await respond(tx, mine.id, true);
      await as(tx, ID.managerA1);
      expect((await tx.query<{ r: Reply }>(`select public.team_cancel_cover($1) r`, [r.request_id])).rows[0].r)
        .toMatchObject({ ok: false, reason: "note_required" });
      expect((await tx.query<{ r: Reply }>(`select public.team_cancel_cover($1, 'Rajeev is back') r`, [r.request_id])).rows[0].r)
        .toMatchObject({ ok: true });
      await as(tx, null);
      expect(await roster(tx, ID.rishabh, D)).toMatchObject({ kind: "weekly_off", segments: [] });
      expect((await tx.query(`select status from public.overtime_entries where cover_request_id = $1`, [r.request_id])).rows)
        .toEqual([{ status: "cancelled" }]);
      expect(await notes(tx, "cover_cancelled")).toHaveLength(1);
    }, SKILLS + `insert into public.roster_entries (outlet_id, staff_id, business_date, kind, segments)
                 values ('${ID.outletA1}', '${ID.rishabh}', '${D}', 'weekly_off', '[]');`);
  });
});

describe("after the cover", () => {
  // Yesterday: Rishabh covered 19:00–21:00 (roster 19:00–23:00), checked in
  // 19:05 and out 20:40 → 95 minutes inside the slot, 90 after rounding.
  const covered = (compOff: boolean, events = true) => `
    ${SKILLS}
    insert into public.cover_requests (id, outlet_id, business_date, role_skill, slot_start, slot_end, mode, status, filled_by_staff_id)
    values ('c0000000-0000-0000-0000-000000000001', '${ID.outletA1}', '${Y}', 'floor', '19:00', '21:00', 'first_accept', 'filled', '${ID.rishabh}');
    insert into public.roster_entries (outlet_id, staff_id, business_date, segments, role_skill, source)
    values ('${ID.outletA1}', '${ID.rishabh}', '${Y}', '[{"start":"19:00","end":"23:00"}]', 'floor', 'cover');
    insert into public.overtime_entries (staff_id, business_date, cover_request_id, planned_minutes, multiplier_bps, comp_off, status)
    values ('${ID.rishabh}', '${Y}', 'c0000000-0000-0000-0000-000000000001', 120, 20000, ${compOff}, 'planned');
    ${events ? `insert into public.attendance_events (outlet_id, staff_id, business_date, kind, at, source) values
      ('${ID.outletA1}', '${ID.rishabh}', '${Y}', 'in', ('${Y} 19:05'::timestamp) at time zone 'Asia/Kolkata', 'device'),
      ('${ID.outletA1}', '${ID.rishabh}', '${Y}', 'out', ('${Y} 20:40'::timestamp) at time zone 'Asia/Kolkata', 'device');` : ""}
    select private.team_recompute_day('${ID.rishabh}', '${Y}');`;

  const settle = (tx: Transaction) => tx.query(`select private.team_cover_sweep()`);
  const ot = async (tx: Transaction) =>
    (await tx.query<{ status: string; actual_minutes: number; amount: number }>(
      `select status, actual_minutes, amount_paise::int amount from public.overtime_entries
        where cover_request_id = 'c0000000-0000-0000-0000-000000000001'`)).rows[0];

  it("pays the minutes worked inside the slot and gives points", async () => {
    await run(null, async (tx) => {
      await settle(tx);
      // ₹67.31/h × 1.5h × 2 = ₹201.92
      expect(await ot(tx)).toEqual({ status: "worked", actual_minutes: 90, amount: 20192 });
      expect((await tx.query(`select points, reason from public.staff_points where staff_id = '${ID.rishabh}'`)).rows)
        .toEqual([{ points: 20, reason: "cover" }]);
      await settle(tx); // only once
      expect((await tx.query(`select count(*)::int n from public.staff_points`)).rows).toEqual([{ n: 1 }]);
    }, covered(false));
  });

  it("comp-off goes into the leave balance instead of pay", async () => {
    await run(null, async (tx) => {
      await settle(tx);
      expect(await ot(tx)).toMatchObject({ status: "worked", amount: 0 });
      expect((await tx.query(`select l.delta_minutes, l.reason from public.leave_ledger l
                                join public.leave_types t on t.id = l.leave_type_id
                               where l.staff_id = '${ID.rishabh}' and t.code = 'comp_off'`)).rows)
        .toEqual([{ delta_minutes: 90, reason: "comp_off" }]);
    }, covered(true));
  });

  it("nobody turned up: the overtime is cancelled, no points", async () => {
    await run(null, async (tx) => {
      await settle(tx);
      expect(await ot(tx)).toMatchObject({ status: "cancelled", actual_minutes: 0 });
      expect((await tx.query(`select count(*)::int n from public.staff_points`)).rows).toEqual([{ n: 0 }]);
    }, covered(false, false));
  });
});

describe("who sees what", () => {
  it("staff see their offers with the amount and their points", async () => {
    await run(ID.managerA1, async (tx) => {
      await create(tx, [ID.rishabh]);
      await as(tx, ID.staffUserRishabh);
      const mine = (await tx.query<{ r: { offers: Record<string, unknown>[]; points: number; can_choose_comp_off: boolean } }>(
        `select public.team_my_cover_offers() r`)).rows[0].r;
      expect(mine.offers).toHaveLength(1);
      expect(mine.offers[0]).toMatchObject({ state: "open", amount_paise: 26923, start: "21:00", minutes: 120 });
      expect(mine).toMatchObject({ points: 0, can_choose_comp_off: true });
    }, SKILLS);
  });

  it("managers who can't see pay don't get overtime amounts — not in the table, the function or the audit log", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await create(tx, [ID.rishabh]);
      expect(await failure(tx, `select offered_ot_paise from public.cover_offers`)).toMatch(/permission denied/);
      expect((await tx.query(`select response from public.cover_offers where cover_request_id = $1`, [r.request_id])).rows)
        .toEqual([{ response: null }]);
      await as(tx, ID.staffUserRishabh);
      const offer = (await tx.query<{ id: string }>(`select id from public.cover_offers where staff_id = '${ID.rishabh}'`)).rows[0];
      await respond(tx, offer.id, true);
      await as(tx, ID.managerA1);
      expect(await failure(tx, `select amount_paise from public.overtime_entries`)).toMatch(/permission denied/);
      expect((await tx.query(`select planned_minutes from public.overtime_entries`)).rows).toEqual([{ planned_minutes: 120 }]);
      expect((await tx.query(`select * from public.team_cover_pay('${ID.outletA1}', '${D}', '${D}')`)).rows).toEqual([]);
      expect((await tx.query(`select count(*)::int n from public.audit_log where table_name = 'overtime_entries'`)).rows).toEqual([{ n: 0 }]);
      await as(tx, ID.ownerA);
      expect((await tx.query(`select amount_paise::int a from public.team_cover_pay('${ID.outletA1}', '${D}', '${D}')`)).rows)
        .toEqual([{ a: 26923 }]);
    }, SKILLS);
  });

  it("the push kick does nothing without pg_net and the vault secrets", async () => {
    await run(null, async (tx) => {
      expect((await tx.query(`select private.team_push_kick() k`)).rows).toEqual([{ k: false }]);
    }, `insert into public.notifications (recipient_profile_id, kind) values ('${ID.managerA1}', 'cover_unfilled');`);
  });
});
