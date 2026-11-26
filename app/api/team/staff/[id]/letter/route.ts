import { NextResponse } from "next/server";
import { todayInKolkata } from "@/lib/date";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import { DEFAULT_LETTER_TEMPLATE, fillTemplate, type LetterValues } from "@/lib/team/letter";
import { renderLetterPdf } from "@/lib/team/letter-pdf";
import { monthlyGrossPaise, structureOn, type SalaryStructure } from "@/lib/team/salary";
import { fail, requireStaffAccess } from "@/lib/team/server-access";

export const runtime = "nodejs";

// "Rs. 12,500" — the PDF's built-in font has no ₹ glyph.
function rs(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return `Rs. ${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// Appointment letter PDF for one staff member, filled from their profile and
// the pay structure in force on their joining date (or today).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireStaffAccess(id, "pay");
  if (access instanceof NextResponse) return access;
  const { supabase } = access;

  const [{ data: staff }, { data: profile }, { data: salaries }, { data: skills }, { data: outlet }, { data: templates }] =
    await Promise.all([
      supabase.from("staff").select("name").eq("id", id).single(),
      supabase.from("staff_profiles").select("mobile, joining_date").eq("staff_id", id).maybeSingle(),
      supabase
        .from("salary_structures")
        .select("id, effective_from, wage_type, basic_paise, da_paise, hra_paise, other_allowances, fixed_incentives, daily_rate_paise")
        .eq("staff_id", id),
      supabase.from("staff_skills").select("skill").eq("staff_id", id),
      supabase.from("outlets").select("name, city, organizations(name)").eq("id", access.outletId).single(),
      supabase
        .from("appointment_letter_templates")
        .select("body_markdown")
        .eq("organization_id", access.organizationId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);
  if (!staff) return fail("not_found", 404);

  const today = todayInKolkata();
  const all = (salaries ?? []) as SalaryStructure[];
  const pay = structureOn(all, profile?.joining_date ?? today) ?? structureOn(all, today);
  const settings = await getTeamSettings(supabase, access.outletId);
  const org = Array.isArray(outlet?.organizations) ? outlet?.organizations[0] : outlet?.organizations;
  const otherAllowances = pay ? [...pay.other_allowances, ...pay.fixed_incentives] : [];

  const values: LetterValues = {
    today: longDate(today),
    staff_name: staff.name,
    mobile: profile?.mobile ?? "—",
    organization_name: org?.name ?? outlet?.name ?? "",
    outlet_name: outlet?.name ?? "",
    outlet_city: outlet?.city ?? "",
    joining_date: longDate(profile?.joining_date),
    role: (skills ?? []).map((s) => s.skill.replace(/_/g, " ")).join(", ") || "staff",
    wage_type: pay?.wage_type === "daily" ? "daily-wage" : "monthly",
    basic: rs(pay?.basic_paise),
    da: rs(pay?.da_paise),
    hra: rs(pay?.hra_paise),
    allowances: otherAllowances.length ? otherAllowances.map((a) => `${a.label} ${rs(a.paise)}`).join(", ") : "—",
    monthly_gross: pay ? rs(monthlyGrossPaise(pay)) : "—",
    daily_rate: rs(pay?.daily_rate_paise),
    notice_period_days: String(settings["exits.notice_period_days"]),
  };

  const body = fillTemplate(templates?.[0]?.body_markdown ?? DEFAULT_LETTER_TEMPLATE, values);
  const pdf = await renderLetterPdf(body, `${values.organization_name} · ${values.outlet_name}`);
  const fileName = `appointment-letter-${staff.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
