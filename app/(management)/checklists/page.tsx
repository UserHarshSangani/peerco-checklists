"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOutletContext } from "../outlet-context";
import { NewChecklistModal, type ChecklistKind } from "./new-checklist-modal";

type TemplateRow = {
  id: string;
  name: string;
  kind: ChecklistKind;
  active: boolean;
};

export default function ChecklistsPage() {
  const { selectedOutlet } = useOutletContext();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">
          Choose an outlet to manage its checklists.
        </p>
      </main>
    );
  }

  return (
    <ChecklistsForOutlet key={selectedOutlet.id} outletId={selectedOutlet.id} />
  );
}

function ChecklistsForOutlet({ outletId }: { outletId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  async function fetchTemplates() {
    return supabase
      .from("checklist_templates")
      .select("id, name, kind, active")
      .eq("outlet_id", outletId)
      .order("name");
  }

  useEffect(() => {
    let cancelled = false;
    fetchTemplates().then(({ data, error }) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  async function toggleActive(row: TemplateRow) {
    setSavingId(row.id);
    setActionError(null);
    const { error } = await supabase
      .from("checklist_templates")
      .update({ active: !row.active })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    const { data, error: refreshError } = await fetchTemplates();
    if (refreshError) {
      setActionError(refreshError.message);
      return;
    }
    setTemplates(data ?? []);
  }

  async function handleCreate({
    name,
    kind,
  }: {
    name: string;
    kind: ChecklistKind;
  }): Promise<{ error: string | null }> {
    const { data, error } = await supabase
      .from("checklist_templates")
      .insert({ outlet_id: outletId, name, kind, active: true })
      .select("id")
      .single();
    if (error || !data) {
      return { error: error?.message ?? "Something went wrong. Please try again." };
    }
    router.push(`/checklists/${data.id}`);
    return { error: null };
  }

  return (
    <main className="flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Checklists
        </h2>
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          New checklist
        </button>
      </div>

      {loading && <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>}
      {loadError && (
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load checklists: {loadError}
        </p>
      )}
      {actionError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          No checklists yet. Create your first one.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
          >
            <Link
              href={`/checklists/${template.id}`}
              className="flex-1 text-base font-medium text-zinc-900 hover:underline dark:text-zinc-50"
            >
              {template.name}
              <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                {template.kind}
              </span>
            </Link>
            <button
              type="button"
              disabled={savingId === template.id}
              onClick={() => toggleActive(template)}
              className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                template.active
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {template.active ? "Active" : "Inactive"}
            </button>
          </li>
        ))}
      </ul>

      {showNewModal && (
        <NewChecklistModal
          onCreate={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </main>
  );
}
