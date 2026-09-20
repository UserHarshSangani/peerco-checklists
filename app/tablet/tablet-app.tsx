"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatDateLabelForLocale } from "@/lib/date";
import { useWakeLock } from "@/lib/use-wake-lock";
import { useLanguage } from "@/lib/i18n/language-context";
import type { ChecklistTemplate, Outlet } from "@/lib/types";
import { ChecklistView } from "./checklist-view";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/language/language-switcher";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export function TabletApp({ outlets }: { outlets: Outlet[] }) {
  const { t, locale } = useLanguage();
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(
    outlets.length === 1 ? outlets[0] : null,
  );
  const [activeTemplate, setActiveTemplate] =
    useState<ChecklistTemplate | null>(null);

  // The tablet is meant to sit on a counter and stay lit the whole shift.
  useWakeLock(true);

  function chooseOutlet(outlet: Outlet | null) {
    setSelectedOutlet(outlet);
    setActiveTemplate(null);
  }

  const today = useMemo(
    () => formatDateLabelForLocale(todayInKolkata(), locale),
    [locale],
  );

  const header = (
    <header className="safe-top sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-text">
          {selectedOutlet ? selectedOutlet.name : "PeerCo Checklists"}
        </p>
        <p className="text-sm text-muted">{today}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {outlets.length > 1 && selectedOutlet && (
          <button
            type="button"
            onClick={() => chooseOutlet(null)}
            className="min-h-[40px] rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-border/40 hover:text-text"
          >
            {t("tablet.switchOutlet")}
          </button>
        )}
        <LanguageSwitcher />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );

  if (outlets.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main className="flex flex-1 items-center justify-center p-6">
          <EmptyState title={t("common.noOutlets")} />
        </main>
      </div>
    );
  }

  if (!selectedOutlet) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        {header}
        <main className="flex-1 p-4 sm:p-6">
          <h2 className="mb-6 text-xl font-semibold text-text">
            {t("tablet.chooseOutlet")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outlets.map((outlet) => (
              <button
                key={outlet.id}
                type="button"
                onClick={() => chooseOutlet(outlet)}
                className="min-h-16 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
              >
                {outlet.name}
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (activeTemplate) {
    return (
      <ChecklistView
        key={activeTemplate.id}
        outlet={selectedOutlet}
        template={activeTemplate}
        onBack={() => setActiveTemplate(null)}
        onSubmitted={() => setActiveTemplate(null)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <TemplatesList
        key={selectedOutlet.id}
        outlet={selectedOutlet}
        onSelect={setActiveTemplate}
      />
    </div>
  );
}

function TemplatesList({
  outlet,
  onSelect,
}: {
  outlet: Outlet;
  onSelect: (template: ChecklistTemplate) => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("checklist_templates")
      .select("id, name")
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
        setTemplates(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outlet.id]);

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-6 text-xl font-semibold text-text">
        {t("common.checklistsHeading")}
      </h2>
      {loading && <SkeletonList rows={3} rowClassName="h-24" />}
      {loadError && (
        <p className="text-danger">
          {t("common.loadChecklistsError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <EmptyState title={t("common.noActiveChecklists")} />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template)}
            className="min-h-16 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
          >
            {template.name}
          </button>
        ))}
      </div>
    </main>
  );
}
