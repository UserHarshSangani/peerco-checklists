"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { getTeamSettings } from "@/lib/team/settings/get-team-settings";
import type { SalaryStructure } from "@/lib/team/salary";
import { Tabs } from "@/components/ui/tabs";
import { SkeletonList } from "@/components/ui/skeleton";
import { ProfileTab } from "./profile-tab";
import { PayTab } from "./pay-tab";
import { JoiningTab } from "./joining-tab";
import { AccessTab } from "./access-tab";
import type { StaffRecord } from "./types";

type TabId = "profile" | "pay" | "joining" | "access";

export default function StaffRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [record, setRecord] = useState<StaffRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("profile");

  const load = useCallback(async () => {
    const { data: access } = await supabase.rpc("team_my_access", { p_staff: id });
    if (!access?.found || !access.can_manage) {
      setError(t("team.record.notFound"));
      return;
    }
    const [staff, profile, skills, salaries, bank, joining, colleagues, documents] = await Promise.all([
      supabase.from("staff").select("id, name, active, outlet_id").eq("id", id).single(),
      supabase.from("staff_profiles").select("*").eq("staff_id", id).maybeSingle(),
      supabase.from("staff_skills").select("skill").eq("staff_id", id),
      access.can_see_pay
        ? supabase
            .from("salary_structures")
            .select("id, effective_from, wage_type, basic_paise, da_paise, hra_paise, other_allowances, fixed_incentives, daily_rate_paise")
            .eq("staff_id", id)
            .order("effective_from", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      access.can_see_pay
        ? supabase.from("staff_bank_accounts").select("account_holder_name, account_last4, ifsc, updated_at").eq("staff_id", id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("joining_checklists").select("*").eq("staff_id", id).maybeSingle(),
      supabase.from("staff").select("id, name").eq("outlet_id", access.outlet_id).eq("active", true).neq("id", id).order("name"),
      supabase.from("staff_documents").select("id, kind, storage_path, note, created_at").eq("staff_id", id).order("created_at", { ascending: false }),
    ]);
    if (staff.error || !staff.data) {
      setError(staff.error?.message ?? t("team.record.notFound"));
      return;
    }
    const settings = await getTeamSettings(supabase, access.outlet_id);
    setRecord({
      staff: staff.data,
      outletId: access.outlet_id,
      canSeePay: Boolean(access.can_see_pay),
      profile: profile.data ?? null,
      skills: (skills.data ?? []).map((s) => s.skill),
      skillOptions: settings["team.skills"],
      salaries: (salaries.data ?? []) as SalaryStructure[],
      bank: bank.data ?? null,
      joining: joining.data ?? null,
      colleagues: colleagues.data ?? [],
      documents: documents.data ?? [],
    });
  }, [supabase, id, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once per staff id
    void load();
  }, [load]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "profile", label: t("team.record.tab.profile") },
    ...(record?.canSeePay ? [{ id: "pay" as const, label: t("team.record.tab.pay") }] : []),
    { id: "joining", label: t("team.record.tab.joining") },
    { id: "access", label: t("team.record.tab.access") },
  ];

  return (
    <main className="flex-1 p-4 sm:p-6">
      <Link
        href="/team/staff"
        className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("team.record.back")}
      </Link>

      {error && <p className="text-danger">{error}</p>}
      {!record && !error && <SkeletonList rows={5} rowClassName="h-14" />}

      {record && (
        <div className="flex max-w-3xl flex-col gap-4">
          <h2 className="font-serif text-2xl font-bold text-text">{record.staff.name}</h2>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          {tab === "profile" && <ProfileTab record={record} onSaved={load} />}
          {tab === "pay" && record.canSeePay && <PayTab record={record} onSaved={load} />}
          {tab === "joining" && <JoiningTab record={record} onSaved={load} />}
          {tab === "access" && <AccessTab record={record} onSaved={load} />}
        </div>
      )}
    </main>
  );
}
