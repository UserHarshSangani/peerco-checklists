"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useOutletContext } from "../../outlet-context";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";

type Row = {
  id: string;
  name: string;
  active: boolean;
  staff_profiles: { mobile: string | null; employment_status: string; login_enabled: boolean } | null;
  staff_skills: { skill: string }[];
};

export default function TeamStaffPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.staff.chooseOutlet")}</p>
      </main>
    );
  }
  return <StaffList key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}

function StaffList({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("staff")
      .select("id, name, active, staff_profiles(mobile, employment_status, login_enabled), staff_skills(skill)")
      .eq("outlet_id", outletId)
      .order("active", { ascending: false })
      .order("name")
      .then(({ data, error: loadError }) => {
        if (cancelled) return;
        setLoading(false);
        if (loadError) setError(loadError.message);
        else setRows((data ?? []) as unknown as Row[]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.staff.heading")}</h2>
      <p className="mb-6 max-w-2xl text-sm text-muted">{t("team.staff.intro")}</p>

      {loading && <SkeletonList rows={4} rowClassName="h-16" />}
      {error && <p className="text-danger">{t("common.loadStaffError", { error })}</p>}
      {!loading && !error && rows.length === 0 && <EmptyState title={t("manager.noStaffYet")} />}

      <ul className="flex max-w-3xl flex-col gap-2">
        {rows.map((row) => {
          const profile = Array.isArray(row.staff_profiles) ? row.staff_profiles[0] : row.staff_profiles;
          return (
            <li key={row.id}>
              <Link
                href={`/team/staff/${row.id}`}
                className="flex min-h-[64px] items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border hover:ring-accent"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-text">
                    {row.name}
                    {profile?.login_enabled && (
                      <Smartphone className="h-4 w-4 text-accent" aria-label={t("team.staff.phoneLoginOn")} />
                    )}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {[profile?.mobile, row.staff_skills.map((s) => s.skill.replace(/_/g, " ")).join(", ")]
                      .filter(Boolean)
                      .join(" · ") || t("team.staff.noProfileYet")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!row.active ? (
                    <StatusPill>{t("manager.inactive")}</StatusPill>
                  ) : profile && profile.employment_status !== "active" ? (
                    <StatusPill tone="warning">
                      {t(`team.status.${profile.employment_status}` as TranslationKey)}
                    </StatusPill>
                  ) : null}
                  <ChevronRight className="h-5 w-5 text-muted" aria-hidden="true" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
