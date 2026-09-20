"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistTemplate, Outlet } from "@/lib/types";
import { ChecklistView } from "./checklist-view";
import { LogoutButton } from "./logout-button";

export function TabletApp({ outlets }: { outlets: Outlet[] }) {
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(
    outlets.length === 1 ? outlets[0] : null,
  );
  const [activeTemplate, setActiveTemplate] =
    useState<ChecklistTemplate | null>(null);

  function chooseOutlet(outlet: Outlet | null) {
    setSelectedOutlet(outlet);
    setActiveTemplate(null);
  }

  const header = (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <div>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          PeerCo Checklists
        </p>
        {selectedOutlet && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {selectedOutlet.name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {outlets.length > 1 && selectedOutlet && (
          <button
            type="button"
            onClick={() => chooseOutlet(null)}
            className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Switch outlet
          </button>
        )}
        <LogoutButton />
      </div>
    </header>
  );

  if (outlets.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
        {header}
        <main className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-zinc-600 dark:text-zinc-300">
            No outlets are assigned to your account yet.
          </p>
        </main>
      </div>
    );
  }

  if (!selectedOutlet) {
    return (
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
        {header}
        <main className="flex-1 p-6">
          <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Choose an outlet
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outlets.map((outlet) => (
              <button
                key={outlet.id}
                type="button"
                onClick={() => chooseOutlet(outlet)}
                className="rounded-2xl bg-white p-8 text-left text-xl font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-100 active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800"
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
      <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
        {header}
        <ChecklistView
          key={activeTemplate.id}
          outlet={selectedOutlet}
          template={activeTemplate}
          onBack={() => setActiveTemplate(null)}
          onSubmitted={() => setActiveTemplate(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
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
    <main className="flex-1 p-6">
      <h2 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Checklists
      </h2>
      {loading && (
        <p className="text-zinc-500 dark:text-zinc-400">
          Loading checklists…
        </p>
      )}
      {loadError && (
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load checklists: {loadError}
        </p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          No active checklists for this outlet.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template)}
            className="rounded-2xl bg-white p-8 text-left text-xl font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 transition hover:bg-zinc-100 active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-50 dark:ring-zinc-800 dark:hover:bg-zinc-800"
          >
            {template.name}
          </button>
        ))}
      </div>
    </main>
  );
}
