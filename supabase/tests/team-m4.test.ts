import { beforeAll, describe, expect, it } from "vitest";
import type { Transaction } from "@electric-sql/pglite";
import { createTestDb, type Db } from "./harness/db";
import { ID, seedFixtures } from "./harness/fixtures";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
  await seedFixtures(db);
}, 60_000);

// Fixtures: on 2026-11-26 Rishabh is rostered 12:00–21:00 and Rajeev 14:00–23:00 (IST), both floor, outlet A1.

/** Runs `setup` as the superuser, then `fn` as `userId` (or as the superuser when null). Always rolled back. */
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

const ist = (date: string, time: string) => `${date}T${time}:00+05:30`;
const D = "2026-11-26";

function event(staff: string, kind: "in" | "out", time: string, date = D, status = "ok") {
  return `insert into public.attendance_events (outlet_id, staff_id, business_date, kind, at, source, status)
          values ('${ID.outletA1}', '${staff}', '${date}', '${kind}', '${ist(date, time)}', 'device', '${status}');`;
}

type Day = { status: string; late_minutes: number; payable_minutes: number };

async function day(tx: Transaction, staff: string, date = D): Promise<Day | undefined> {
  const { rows } = await tx.query<Day>(
    `select status, late_minutes, payable_minutes from public.attendance_days where staff_id = $1 and business_date = $2`,
    [staff, date],
  );
  return rows[0];
}

async function recompute(tx: Transaction, staff: string, now: string) {
  await tx.query(`select private.team_recompute_day($1, $2, $3)`, [staff, D, now]);
}

describe("shift times as real timestamps", () => {
  it("handles IST and past-midnight shifts", async () => {
    const { rows } = await run(null, (tx) =>
      tx.query<{ lo: string; hi: string; mins: number }>(
        `select to_char(lower(r) at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as lo,
                to_char(upper(r) at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as hi,
                private.team_range_minutes(r) as mins
           from (select private.team_shift_range('2026-11-26', '[{"start":"18:00","end":"01:00"}]', '02:00') as r) q`,
      ),
    );
    expect(rows[0]).toEqual({ lo: "2026-11-26 12:30", hi: "2026-11-26 20:30", mins: 480 });
  });
});

describe("working out a day", () => {
  it("late arrival, payable time only inside the shift, rounded", async () => {
    const d = await run(null, async (tx) => {
      await recompute(tx, ID.rishabh, ist(D, "23:00"));
      return day(tx, ID.rishabh);
    }, event(ID.rishabh, "in", "12:20") + event(ID.rishabh, "out", "21:30"));
    // 12:20–21:00 inside the shift = 520 min -> nearest 15 = 525. Staying late doesn't add time.
    expect(d).toEqual({ status: "present", late_minutes: 20, payable_minutes: 525 });
  });

  it("within grace is not late, and an unpaid break comes off", async () => {
    const d = await run(null, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into public.shift_templates (outlet_id, name, segments, break_minutes)
         values ('${ID.outletA1}', 'Day', '[{"start":"12:00","end":"21:00"}]', 30) returning id`,
      );
      await tx.query(`update public.roster_entries set shift_template_id = $1 where staff_id = $2 and business_date = $3`, [
        rows[0].id,
        ID.rishabh,
        D,
      ]);
      await recompute(tx, ID.rishabh, ist(D, "23:00"));
      return day(tx, ID.rishabh);
    }, event(ID.rishabh, "in", "12:08") + event(ID.rishabh, "out", "21:00"));
    // 12:08–21:00 = 532, minus 30 = 502 -> 495 (nearest 15)
    expect(d).toEqual({ status: "present", late_minutes: 0, payable_minutes: 495 });
  });

  it("no check-in: nothing during the shift, absent once it's over", async () => {
    await run(null, async (tx) => {
      await recompute(tx, ID.rajeev, ist(D, "20:00"));
      expect(await day(tx, ID.rajeev)).toBeUndefined();
      await recompute(tx, ID.rajeev, ist(D, "23:30"));
      expect((await day(tx, ID.rajeev))?.status).toBe("absent_unapproved");
    });
  });

  it("follows the outlet's rounding setting", async () => {
    const d = await run(null, async (tx) => {
      await recompute(tx, ID.rishabh, ist(D, "23:00"));
      return day(tx, ID.rishabh);
    },
    `insert into public.outlet_settings (outlet_id, key, value) values ('${ID.outletA1}', 'attendance.rounding_mode', '"down"');` +
      event(ID.rishabh, "in", "12:00") + event(ID.rishabh, "out", "20:59"));
    expect(d?.payable_minutes).toBe(525); // 539 -> down to 525
  });
});

describe("the 5-minute sweep", () => {
  const sweep = (tx: Transaction, now: string) =>
    tx.query<{ r: { closed: number; notifications: number } }>(`select private.team_attendance_sweep($1) as r`, [now]);

  it("closes a forgotten check-out at the rostered end, for the manager to confirm", async () => {
    await run(null, async (tx) => {
      expect((await sweep(tx, ist(D, "22:59"))).rows[0].r.closed).toBe(0);
      const done = (await sweep(tx, ist(D, "23:01"))).rows[0].r;
      expect(done.closed).toBe(1);
      const { rows } = await tx.query<{ at: string; status: string; source: string }>(
        `select to_char(at at time zone 'Asia/Kolkata', 'HH24:MI') as at, status, source from public.attendance_events
          where staff_id = '${ID.rishabh}' and kind = 'out'`,
      );
      expect(rows).toEqual([{ at: "21:00", status: "needs_confirmation", source: "auto" }]);
      expect(await day(tx, ID.rishabh)).toMatchObject({ status: "needs_confirmation", payable_minutes: 540 });
      const notes = await tx.query<{ recipient_profile_id: string }>(
        `select recipient_profile_id from public.notifications where kind = 'attendance_auto_closed' order by 1`,
      );
      expect(notes.rows.map((r) => r.recipient_profile_id).sort()).toEqual([ID.ownerA, ID.managerA1].sort());
      // Running again does nothing new.
      expect((await sweep(tx, ist(D, "23:06"))).rows[0].r).toEqual({ closed: 0, notifications: 0 });
    }, event(ID.rishabh, "in", "12:00"));
  });

  it("alerts managers once about a no-show", async () => {
    await run(null, async (tx) => {
      await sweep(tx, ist(D, "14:29"));
      const count = async () =>
        (await tx.query<{ n: number }>(`select count(*)::int as n from public.notifications where kind = 'attendance_no_show' and outlet_id = '${ID.outletA1}'`)).rows[0].n;
      expect(await count()).toBe(0);
      await sweep(tx, ist(D, "14:31"));
      expect(await count()).toBe(2); // manager + owner, about Rajeev (Rishabh checked in)
      await sweep(tx, ist(D, "14:36"));
      expect(await count()).toBe(2);
    }, event(ID.rishabh, "in", "12:00"));
  });

  it("marks a finished shift with no check-in as absent", async () => {
    await run(null, async (tx) => {
      await sweep(tx, ist(D, "23:30"));
      expect((await day(tx, ID.rajeev))?.status).toBe("absent_unapproved");
    });
  });
});

describe("tablet check-in and check-out", () => {
  const NO_PHOTO = `insert into public.outlet_settings (outlet_id, key, value) values ('${ID.outletA1}', 'attendance.photo_required', 'false');`;
  const call = async (tx: Transaction, kind: string, pin = "2345", staff = ID.rajeev) =>
    (
      await tx.query<{ r: Record<string, unknown> }>(`select public.team_check_in_out($1, $2, $3, $4, null) as r`, [
        ID.outletA1,
        staff,
        pin,
        kind,
      ])
    ).rows[0].r;

  it("checks in and out once each, with the PIN", async () => {
    await run(ID.deviceA1, async (tx) => {
      expect((await call(tx, "in", "0000")).reason).toBe("invalid_pin");
      expect(await call(tx, "in")).toMatchObject({ ok: true, kind: "in" });
      expect(await call(tx, "in")).toEqual({ ok: false, reason: "already_in" });
      expect(await call(tx, "out")).toMatchObject({ ok: true, kind: "out" });
      expect(await call(tx, "out")).toEqual({ ok: false, reason: "not_checked_in" });
    }, NO_PHOTO);
  });

  it("needs a photo unless the outlet turns that off", async () => {
    await run(ID.deviceA1, async (tx) => {
      expect(await call(tx, "in")).toEqual({ ok: false, reason: "missing_photo" });
    });
  });

  it("refuses another organisation's tablet and people who have left", async () => {
    await run(ID.ownerB, async (tx) => {
      expect(await call(tx, "in")).toEqual({ ok: false, reason: "not_allowed" });
    }, NO_PHOTO);
    await run(ID.deviceA1, async (tx) => {
      expect(await call(tx, "in")).toEqual({ ok: false, reason: "invalid_staff" });
    }, NO_PHOTO + `update public.staff_profiles set employment_status = 'exited' where staff_id = '${ID.rajeev}';`);
  });

  it("shows the tablet names and state only for its own outlet", async () => {
    const list = await run(ID.deviceA1, async (tx) => {
      await call(tx, "in");
      const { rows } = await tx.query<{ r: { name: string; state: string }[] }>(
        `select public.team_device_today($1) as r`,
        [ID.outletA1],
      );
      return rows[0].r.map((x) => [x.name, x.state]);
    }, NO_PHOTO);
    expect(list).toEqual([
      ["Rajeev", "in"],
      ["Rishabh", "none"],
    ]);
    await expect(
      run(ID.ownerB, (tx) => tx.query(`select public.team_device_today($1)`, [ID.outletA1])),
    ).rejects.toThrow(/not allowed/);
  });

  it("the tablet can't write attendance rows directly", async () => {
    await expect(
      run(ID.deviceA1, (tx) => tx.exec(event(ID.rajeev, "in", "14:00"))),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("manager fixes", () => {
  const AUTO = event(ID.rishabh, "in", "12:00") + event(ID.rishabh, "out", "21:00", D, "needs_confirmation");
  const outId = `(select id from public.attendance_events where staff_id = '${ID.rishabh}' and kind = 'out')`;

  it("confirms or corrects an auto-closed check-out (note needed to change it)", async () => {
    await run(ID.managerA1, async (tx) => {
      const ask = (sql: string) => tx.query<{ r: { ok: boolean; reason?: string } }>(sql).then((r) => r.rows[0].r);
      expect(await ask(`select public.team_confirm_attendance_event(${outId}, '${ist(D, "19:00")}', '') as r`)).toEqual({
        ok: false,
        reason: "note_required",
      });
      expect(await ask(`select public.team_confirm_attendance_event(${outId}, '${ist(D, "19:00")}', 'Left at 7') as r`)).toEqual({ ok: true });
      expect(await day(tx, ID.rishabh)).toMatchObject({ status: "present", payable_minutes: 420 });
      const { rows } = await tx.query<{ actor: string }>(
        `select actor from public.audit_log where table_name = 'attendance_events' order by id desc limit 1`,
      );
      expect(rows[0].actor).toBe(ID.managerA1);
    }, AUTO);
  });

  it("adds a missed check-in and voids a wrong one", async () => {
    await run(ID.managerA1, async (tx) => {
      const r = await tx.query<{ r: { ok: boolean } }>(
        `select public.team_add_attendance_event($1, $2, 'in', $3, 'Tablet was down') as r`,
        [ID.rajeev, D, ist(D, "14:00")],
      );
      expect(r.rows[0].r).toEqual({ ok: true });
      const v = await tx.query<{ r: { ok: boolean } }>(
        `select public.team_void_attendance_event(id, 'Wrong person') as r from public.attendance_events where staff_id = $1`,
        [ID.rajeev],
      );
      expect(v.rows[0].r).toEqual({ ok: true });
    });
  });

  it("tablets, staff and other owners can't fix attendance", async () => {
    for (const user of [ID.deviceA1, ID.staffUserRishabh, ID.ownerB]) {
      await expect(
        run(user, (tx) => tx.query(`select public.team_confirm_attendance_event(${outId})`), AUTO),
      ).rejects.toThrow(/not allowed/);
    }
  });

  it("staff see their own days only", async () => {
    const seen = await run(ID.staffUserRishabh, async (tx) => {
      const { rows } = await tx.query<{ staff_id: string }>(`select staff_id from public.attendance_days`);
      return rows.map((r) => r.staff_id);
    }, AUTO + `select private.team_recompute_day('${ID.rishabh}', '${D}', '${ist(D, "23:00")}');
               select private.team_recompute_day('${ID.rajeev}', '${D}', '${ist(D, "23:30")}');`);
    expect(seen).toEqual([ID.rishabh]);
  });
});
