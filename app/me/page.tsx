import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/roles";
import { todayInKolkata } from "@/lib/date";
import { monthlyGrossPaise, structureOn, type SalaryStructure } from "@/lib/team/salary";
import { StaffHome } from "./staff-home";

// Home screen for a staff member signed in on their own phone. Milestone 2
// shows who they are; shifts, attendance, leave and Gullak arrive later.
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
    .select("staff_id, joining_date, mobile, wage_type, staff(name), outlets(name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: salaries } = me
    ? await supabase
        .from("salary_structures")
        .select("id, effective_from, wage_type, basic_paise, da_paise, hra_paise, other_allowances, fixed_incentives, daily_rate_paise")
        .eq("staff_id", me.staff_id)
    : { data: [] };

  const current = structureOn((salaries ?? []) as SalaryStructure[], todayInKolkata());
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  return (
    <StaffHome
      linked={Boolean(me)}
      name={one(me?.staff ?? null)?.name ?? null}
      outletName={one(me?.outlets ?? null)?.name ?? null}
      joiningDate={me?.joining_date ?? null}
      mobile={me?.mobile ?? null}
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
