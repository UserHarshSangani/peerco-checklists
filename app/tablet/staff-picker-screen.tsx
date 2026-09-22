"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { Outlet, StaffMember } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { SkeletonList } from "@/components/ui/skeleton";
import { useTaskPermissions, type TaskKey } from "./task-permissions-context";

// Full-screen "Select your name" step shown before any activity starts (if
// nobody is picked yet) — a grid of Avatar buttons, one tap and done. The
// PIN is still collected separately at submit time. Filtered to staff
// allowed to do `task` — a convenience only, the database still checks
// this again at submit time.
export function StaffPickerScreen({
  outlet,
  task,
  onPick,
  onCancel,
}: {
  outlet: Outlet;
  task: TaskKey;
  onPick: (member: StaffMember) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const { isAllowed } = useTaskPermissions();
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("staff")
      .select("id, name, active")
      .eq("outlet_id", outlet.id)
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        setAllStaff((data ?? []).map(({ id, name }) => ({ id, name })));
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outlet.id]);

  const staff = allStaff.filter((member) => isAllowed(member.id, task));

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-top border-b border-border bg-surface px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[40px] text-sm font-medium text-muted hover:text-text"
        >
          ‹ {t("common.back")}
        </button>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <h2 className="mb-1 font-serif text-2xl font-bold text-text">
          {t("tablet.selectYourName")}
        </h2>
        <p className="mb-6 text-sm text-muted">{outlet.name}</p>

        {loading && <SkeletonList rows={4} rowClassName="h-24" />}
        {loadError && (
          <p className="text-danger">
            {t("common.loadStaffError", { error: loadError })}
          </p>
        )}
        {!loading && !loadError && staff.length === 0 && allStaff.length === 0 && (
          <p className="text-muted">{t("tablet.noActiveStaff")}</p>
        )}
        {!loading && !loadError && staff.length === 0 && allStaff.length > 0 && (
          <p className="text-muted">{t("tablet.someStaffNoAccess")}</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {staff.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => onPick(member)}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-4 text-center shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              <Avatar name={member.name} size="lg" />
              <span className="text-base font-medium text-text">{member.name}</span>
            </button>
          ))}
        </div>
        {!loading && !loadError && staff.length > 0 && staff.length < allStaff.length && (
          <p className="mt-4 text-sm text-muted">{t("tablet.someStaffNoAccess")}</p>
        )}
      </main>
    </div>
  );
}
