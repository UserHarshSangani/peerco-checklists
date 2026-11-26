"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import { DEFAULT_LETTER_TEMPLATE, LETTER_PLACEHOLDERS, unknownPlaceholders } from "@/lib/team/letter";
import { useOutletContext } from "../../outlet-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

type TemplateRow = { id: string; body_markdown: string };

// One appointment letter template per organization (owners and PeerCo admin).
export default function LetterTemplatePage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();
  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.staff.chooseOutlet")}</p>
      </main>
    );
  }
  return <Editor key={selectedOutlet.organizationId} organizationId={selectedOutlet.organizationId} />;
}

function Editor({ organizationId }: { organizationId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [row, setRow] = useState<TemplateRow | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("appointment_letter_templates")
      .select("id, body_markdown")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const found = data?.[0] ?? null;
        setRow(found);
        setBody(found?.body_markdown ?? DEFAULT_LETTER_TEMPLATE);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, organizationId]);

  const unknown = unknownPlaceholders(body);

  async function save() {
    setSaving(true);
    const now = new Date().toISOString();
    const { data, error } = row
      ? await supabase
          .from("appointment_letter_templates")
          .update({ body_markdown: body, updated_at: now })
          .eq("id", row.id)
          .select("id, body_markdown")
          .single()
      : await supabase
          .from("appointment_letter_templates")
          .insert({ organization_id: organizationId, name: "Appointment letter", body_markdown: body })
          .select("id, body_markdown")
          .single();
    setSaving(false);
    if (error) return showError(error.code === "42501" ? t("team.letterTemplate.ownerOnly") : error.message);
    setRow(data);
    showSuccess(t("team.settings.saved"));
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.letterTemplate.heading")}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t("team.letterTemplate.intro")}</p>
      {loading ? (
        <SkeletonList rows={6} rowClassName="h-10" />
      ) : (
        <div className="flex max-w-3xl flex-col gap-4">
          <Card>
            <p className="mb-2 text-sm font-semibold text-text">{t("team.letterTemplate.placeholders")}</p>
            <p className="flex flex-wrap gap-1.5">
              {LETTER_PLACEHOLDERS.map((p) => (
                <code key={p} className="rounded bg-border/40 px-1.5 py-0.5 text-xs text-text">{`{{${p}}}`}</code>
              ))}
            </p>
            <p className="mt-2 text-xs text-muted">{t("team.letterTemplate.format")}</p>
          </Card>
          <textarea
            aria-label={t("team.letterTemplate.heading")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={24}
            className="w-full rounded-xl border border-border bg-bg p-4 font-mono text-sm text-text focus:border-accent focus:outline-none"
          />
          {unknown.length > 0 && (
            <p className="text-sm text-danger">{t("team.letterTemplate.unknown", { names: unknown.join(", ") })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" loading={saving} onClick={save}>
              {t("team.letterTemplate.save")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setBody(DEFAULT_LETTER_TEMPLATE)}>
              {t("team.letterTemplate.reset")}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
