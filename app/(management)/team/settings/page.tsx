"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  isSettingKey,
  SETTING_GROUPS,
  SETTING_KEYS,
  SETTINGS,
  type SettingDef,
  type SettingGroup,
  type SettingKey,
} from "@/lib/team/settings/registry";
import { inputToSetting, settingToInput } from "@/lib/team/settings/display";
import { useOutletContext } from "../../outlet-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";

export default function TeamSettingsPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("team.settings.chooseOutlet")}</p>
      </main>
    );
  }
  return <TeamSettingsForOutlet key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}

type Overrides = Partial<Record<SettingKey, unknown>>;

const KEYS_BY_GROUP: Record<SettingGroup, SettingKey[]> = Object.fromEntries(
  SETTING_GROUPS.map((group) => [group, SETTING_KEYS.filter((key) => SETTINGS[key].group === group)]),
) as Record<SettingGroup, SettingKey[]>;

const VERIFY_COUNT = SETTING_KEYS.filter((key) => (SETTINGS[key] as SettingDef).verify).length;

function unitKey(def: SettingDef): TranslationKey | null {
  if (def.type === "bps") return "team.unit.percent";
  if ("unit" in def && def.unit !== "count") return `team.unit.${def.unit}` as TranslationKey;
  return null;
}

function TeamSettingsForOutlet({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("outlet_settings")
      .select("key, value")
      .eq("outlet_id", outletId)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        const next: Overrides = {};
        for (const row of data ?? []) if (isSettingKey(row.key)) next[row.key] = row.value;
        setOverrides(next);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outletId]);

  async function save(key: SettingKey, value: unknown) {
    setSavingKey(key);
    const { error } = await supabase
      .from("outlet_settings")
      .upsert({ outlet_id: outletId, key, value, updated_at: new Date().toISOString() });
    setSavingKey(null);
    if (error) {
      showError(error.message);
      return;
    }
    setOverrides((prev) => ({ ...prev, [key]: value }));
    showSuccess(t("team.settings.saved"));
  }

  async function reset(key: SettingKey) {
    setSavingKey(key);
    const { error } = await supabase.from("outlet_settings").delete().eq("outlet_id", outletId).eq("key", key);
    setSavingKey(null);
    if (error) {
      showError(error.message);
      return;
    }
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <h2 className="mb-1 font-serif text-xl font-bold text-text">{t("team.settings.heading")}</h2>
      <p className="mb-4 max-w-2xl text-sm text-muted">{t("team.settings.intro")}</p>
      <StatusPill tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />} className="mb-6">
        {t("team.settings.verifyCount", { count: VERIFY_COUNT })}
      </StatusPill>

      {loading && <SkeletonList rows={6} rowClassName="h-16" />}
      {loadError && <p className="text-danger">{t("team.settings.loadError", { error: loadError })}</p>}

      {!loading && !loadError && (
        <div className="flex max-w-3xl flex-col gap-6">
          {SETTING_GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {t(`team.settings.group.${group}` as TranslationKey)}
              </h3>
              <Card className="divide-y divide-border p-0">
                {KEYS_BY_GROUP[group].map((key) => (
                  <SettingRow
                    key={key}
                    settingKey={key}
                    override={overrides[key]}
                    saving={savingKey === key}
                    onSave={(value) => save(key, value)}
                    onReset={() => reset(key)}
                  />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function SettingRow({
  settingKey,
  override,
  saving,
  onSave,
  onReset,
}: {
  settingKey: SettingKey;
  override: unknown;
  saving: boolean;
  onSave: (value: unknown) => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const def: SettingDef = SETTINGS[settingKey];
  const isCustom = override !== undefined;
  const current = isCustom ? override : def.default;
  const [draft, setDraft] = useState(() => settingToInput(settingKey, current));
  const unit = unitKey(def);
  const inputId = `setting-${settingKey}`;

  function commit(raw: string | boolean) {
    const value = inputToSetting(settingKey, raw);
    if (value === null) {
      showError(t("team.settings.invalid"));
      setDraft(settingToInput(settingKey, current));
      return;
    }
    if (JSON.stringify(value) === JSON.stringify(current)) return;
    onSave(value);
  }

  const defaultText =
    def.type === "boolean"
      ? t(def.default ? "team.settings.yes" : "team.settings.no")
      : def.type === "enum"
        ? t(`team.option.${def.default}` as TranslationKey)
        : `${settingToInput(settingKey, def.default)}${unit ? ` ${t(unit)}` : ""}`;

  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="text-sm font-medium text-text">
          {t(`team.setting.${settingKey}` as TranslationKey)}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {def.verify && (
            <span title={t("team.settings.verifyHelp")}>
              <StatusPill tone="warning" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                {t("team.settings.verifyBadge")}
              </StatusPill>
            </span>
          )}
          <span className="text-xs text-muted">
            {isCustom ? t("team.settings.custom") : t("team.settings.default", { value: defaultText })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {def.type === "boolean" ? (
          <button
            id={inputId}
            type="button"
            role="switch"
            aria-checked={current === true}
            disabled={saving}
            onClick={() => commit(!(current === true))}
            className={`min-h-[44px] min-w-[72px] rounded-full px-4 text-sm font-semibold ${
              current === true ? "bg-accent text-accent-fg" : "bg-border/50 text-muted"
            }`}
          >
            {t(current === true ? "team.settings.yes" : "team.settings.no")}
          </button>
        ) : def.type === "enum" ? (
          <select
            id={inputId}
            value={String(current)}
            disabled={saving}
            onChange={(event) => commit(event.target.value)}
            className="min-h-[44px] rounded-lg bg-surface px-3 text-sm text-text ring-1 ring-border"
          >
            {def.options.map((option) => (
              <option key={option} value={option}>
                {t(`team.option.${option}` as TranslationKey)}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              id={inputId}
              type={def.type === "time" ? "time" : "text"}
              inputMode={def.type.endsWith("list") || def.type === "time" ? undefined : "decimal"}
              value={draft}
              disabled={saving}
              title={def.type.endsWith("list") ? t("team.settings.listHint") : undefined}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => commit(draft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
              }}
              className="min-h-[44px] w-36 rounded-lg bg-surface px-3 text-right text-sm text-text ring-1 ring-border"
            />
            {unit && <span className="w-12 text-sm text-muted">{t(unit)}</span>}
          </>
        )}
        {isCustom && (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              onReset();
              setDraft(settingToInput(settingKey, def.default));
            }}
            aria-label={t("team.settings.reset")}
            title={t("team.settings.reset")}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
