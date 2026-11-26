import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/roles";
import { addDaysToDateString, todayInKolkata } from "@/lib/date";
import { monthlyGrossPaise, structureOn, type SalaryStructure } from "@/lib/team/salary";
import { StaffHome, type StaffShift } from "./staff-home";
import type { MyBank, MyDetails } from "./my-details";
import type { MyLeave, MyLeaveRequest } from "./my-leave";
import type { MyCover } from "./my-cover";
import type { MyGullak } from "./my-gullak";
import { parseRules, type LeaveType } from "@/lib/team/engines/leave";

// Home screen for a staff member signed in on their own phone: who they
// are, their shifts for the next 7 days, their Gullak, their details, their leave and cover offers.
export default async function MePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/staff-login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "staff") redirect(homeForRole(profile?.role));

  const { data: me } = await supabase
    .from("staff_profiles")
    .select(
      "staff_id, outlet_id, joining_date, mobile, wage_type, gender, date_of_birth, address, emergency_contact_name, emergency_contact_phone, uan, esic_ip_number, photo_path, staff(name), outlets(name)",
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: salaries } = me
    ? await supabase
        .from("salary_structures")
        .select("id, effective_from, wage_type, basic_paise, da_paise, hra_paise, other_allowances, fixed_incentives, daily_rate_paise")
        .eq("staff_id", me.staff_id)
    : { data: [] };

  const today = todayInKolkata();
  const { data: shifts } = me
    ? await supabase
        .from("roster_entries")
        .select("business_date, kind, segments, extended_until")
        .eq("staff_id", me.staff_id)
        .gte("business_date", today)
        .lte("business_date", addDaysToDateString(today, 6))
        .order("business_date")
    : { data: [] };

  const { data: checkIn } = me
    ? await supabase
        .from("attendance_events")
        .select("at")
        .eq("staff_id", me.staff_id)
        .eq("business_date", today)
        .eq("kind", "in")
        .neq("status", "void")
        .order("at")
        .limit(1)
        .maybeSingle()
    : { data: null };

  const [{ data: bankRow }, { data: bankRequest }, photo] = me
    ? await Promise.all([
        supabase.from("staff_bank_accounts").select("account_holder_name, account_last4, ifsc").eq("staff_id", me.staff_id).maybeSingle(),
        supabase
          .from("staff_bank_change_requests")
          .select("status, account_last4, ifsc, decision_note")
          .eq("staff_id", me.staff_id)
          .neq("status", "cancelled")
          .order("requested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        me.photo_path ? supabase.storage.from("staff-photos").createSignedUrl(me.photo_path, 3600) : Promise.resolve(null),
      ])
    : [{ data: null }, { data: null }, null];

  const [{ data: coverData }, { data: gullakData }] = me
    ? await Promise.all([supabase.rpc("team_my_cover_offers"), supabase.rpc("team_my_gullak")])
    : [{ data: null }, { data: null }];

  const [{ data: leaveTypes }, { data: ledger }, { data: leaveRequests }, { data: offs }, { data: leaveSettings }] = me
    ? await Promise.all([
        supabase.from("leave_types").select("id, code, name, paid, needs_proof, active, accrual").eq("outlet_id", me.outlet_id).order("name"),
        supabase.from("leave_ledger").select("leave_type_id, delta_minutes").eq("staff_id", me.staff_id),
        supabase
          .from("leave_requests")
          .select("id, leave_type_id, from_date, to_date, leaving_at, status, paid_minutes, unpaid_minutes, decision_note")
          .eq("staff_id", me.staff_id)
          .or(`status.eq.pending,to_date.gte.${addDaysToDateString(today, -60)}`)
          .order("from_date", { ascending: false })
          .limit(20),
        supabase
          .from("roster_entries")
          .select("business_date")
          .eq("staff_id", me.staff_id)
          .eq("kind", "weekly_off")
          .gte("business_date", today)
          .lte("business_date", addDaysToDateString(today, 90)),
        supabase.rpc("team_my_leave_settings"),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }, { data: null }];

  const current = structureOn((salaries ?? []) as SalaryStructure[], today);
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const staffName = one(me?.staff ?? null)?.name ?? null;

  const details: MyDetails | null = me
    ? {
        staffId: me.staff_id,
        outletId: me.outlet_id,
        name: staffName ?? "",
        photoUrl: photo?.data?.signedUrl ?? null,
        gender: me.gender,
        dateOfBirth: me.date_of_birth,
        address: me.address,
        emergencyName: me.emergency_contact_name,
        emergencyPhone: me.emergency_contact_phone,
        uan: me.uan,
        esicIp: me.esic_ip_number,
      }
    : null;
  const bank: MyBank = {
    current: bankRow ? { holder: bankRow.account_holder_name, last4: bankRow.account_last4, ifsc: bankRow.ifsc } : null,
    request: bankRequest
      ? { status: bankRequest.status, last4: bankRequest.account_last4, ifsc: bankRequest.ifsc, note: bankRequest.decision_note }
      : null,
  };

  const settings = (leaveSettings ?? null) as { notice_days: number; day_minutes: number } | null;
  const balances: Record<string, number> = {};
  for (const row of ledger ?? []) balances[row.leave_type_id] = (balances[row.leave_type_id] ?? 0) + row.delta_minutes;
  const leave: MyLeave | null =
    me && settings
      ? {
          staffId: me.staff_id,
          outletId: me.outlet_id,
          today,
          noticeDays: settings.notice_days,
          dayMinutes: settings.day_minutes,
          types: (leaveTypes ?? []).map(
            (row): LeaveType => ({
              id: row.id,
              code: row.code,
              name: row.name,
              paid: row.paid,
              needsProof: row.needs_proof,
              active: row.active,
              rules: parseRules(row.accrual),
            }),
          ),
          balances,
          requests: (leaveRequests ?? []) as MyLeaveRequest[],
          weeklyOffs: (offs ?? []).map((o) => o.business_date),
        }
      : null;

  return (
    <StaffHome
      leave={leave}
      cover={(coverData ?? null) as MyCover | null}
      gullak={(gullakData ?? null) as MyGullak | null}
      linked={Boolean(me)}
      name={staffName}
      outletName={one(me?.outlets ?? null)?.name ?? null}
      joiningDate={me?.joining_date ?? null}
      mobile={me?.mobile ?? null}
      today={today}
      checkedInAt={checkIn?.at ?? null}
      details={details}
      bank={bank}
      shifts={(shifts ?? []) as StaffShift[]}
      pay={
        current
          ? current.wage_type === "daily"
            ? { kind: "daily", paise: current.daily_rate_paise ?? 0 }
            : { kind: "monthly", paise: monthlyGrossPaise(current) }
          : null
      }
    />
  );
}
