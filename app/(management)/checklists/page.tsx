"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../outlet-context";
import { NewChecklistModal, type ChecklistKind } from "./new-checklist-modal";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type TemplateRow = {
  id: string;
  name: string;
  kind: ChecklistKind;
  active: boolean;
};

export default function ChecklistsPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("manager.chooseOutletChecklists")}</p>
      </main>
    );
  }

  return (
    <ChecklistsForOutlet key={selectedOutlet.id} outletId={selectedOutlet.id} />
  );
}

function ChecklistsForOutlet({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const kindLabels: Record<ChecklistKind, string> = {
    opening: t("manager.kindOpening"),
    closing: t("manager.kindClosing"),
  };

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
      return { error: error?.message ?? t("manager.createError") };
    }
    router.push(`/checklists/${data.id}`);
    return { error: null };
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-text">
          {t("common.checklistsHeading")}
        </h2>
        <Button type="button" onClick={() => setShowNewModal(true)}>
          {t("manager.newChecklist")}
        </Button>
      </div>

      {loading && <SkeletonList rows={3} rowClassName="h-16" />}
      {loadError && (
        <p className="text-danger">
          {t("common.loadChecklistsError", { error: loadError })}
        </p>
      )}
      {actionError && (
        <p className="mb-4 text-sm font-medium text-danger">{actionError}</p>
      )}
      {!loading && !loadError && templates.length === 0 && (
        <EmptyState title={t("manager.noChecklistsYet")} />
      )}

      <ul className="flex flex-col gap-3">
        {templates.map((template) => (
          <li
            key={template.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
          >
            <Link
              href={`/checklists/${template.id}`}
              className="flex-1 text-base font-medium text-text hover:underline"
            >
              {template.name}
              <span className="ml-2 text-sm font-normal text-muted">
                {kindLabels[template.kind]}
              </span>
            </Link>
            <button
              type="button"
              disabled={savingId === template.id}
              onClick={() => toggleActive(template)}
              className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                template.active
                  ? "bg-success/15 text-success"
                  : "bg-border/50 text-muted"
              }`}
            >
              {template.active ? t("manager.active") : t("manager.inactive")}
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
