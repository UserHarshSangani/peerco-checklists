"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, PackageSearch, Truck, ChefHat } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useOutletContext } from "../outlet-context";
import {
  StaffPinModal,
  DEFAULT_TASK_PERMISSIONS,
  type TaskPermissionValues,
} from "./staff-pin-modal";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";

type StaffRow = {
  id: string;
  name: string;
  active: boolean;
  locked_until: string | null;
  can_checklists: boolean;
  can_stock_counts: boolean;
  can_goods_received: boolean;
  can_wastage: boolean;
};

const PERMISSION_TOGGLES: {
  key: keyof TaskPermissionValues;
  label: TranslationKey;
  icon: typeof ClipboardCheck;
}[] = [
  { key: "can_checklists", label: "manager.permissions.checklists", icon: ClipboardCheck },
  { key: "can_stock_counts", label: "manager.permissions.stockCounts", icon: PackageSearch },
  { key: "can_goods_received", label: "manager.permissions.goodsReceived", icon: Truck },
  { key: "can_wastage", label: "manager.permissions.wastage", icon: ChefHat },
];

// A quick-scan summary for the list — omitted entirely when every task is
// on, which is the common case.
function permissionsSummary(
  row: StaffRow,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string | null {
  const on = PERMISSION_TOGGLES.filter(({ key }) => row[key]);
  const off = PERMISSION_TOGGLES.filter(({ key }) => !row[key]);
  if (off.length === 0) return null;
  if (on.length === 0) return t("manager.permissions.none");
  if (on.length === 1) return t("manager.permissions.onlyX", { task: t(on[0].label) });
  if (off.length === 1) return t("manager.permissions.allExceptX", { task: t(off[0].label) });
  return on.map(({ label }) => t(label)).join(", ");
}

export default function StaffPage() {
  const { selectedOutlet } = useOutletContext();
  const { t } = useLanguage();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">{t("manager.chooseOutletStaff")}</p>
      </main>
    );
  }

  return <StaffForOutlet key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}

function isLocked(lockedUntil: string | null): boolean {
  return lockedUntil != null && new Date(lockedUntil).getTime() > Date.now();
}

function StaffForOutlet({ outletId }: { outletId: string }) {
  const { t } = useLanguage();
  const { showError } = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetPinFor, setResetPinFor] = useState<StaffRow | null>(null);

  // Only ever these eight columns — never pin_hash, never select("*").
  async function fetchStaff() {
    return supabase
      .from("staff")
      .select(
        "id, name, active, locked_until, can_checklists, can_stock_counts, can_goods_received, can_wastage",
      )
      .eq("outlet_id", outletId)
      .order("name");
  }

  async function refresh() {
    const { data, error } = await fetchStaff();
    if (error) {
      showError(error.message);
      return;
    }
    setStaff(data ?? []);
  }

  useEffect(() => {
    let cancelled = false;
    fetchStaff().then(({ data, error }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setStaff(data ?? []);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  async function handleAddStaff({
    name,
    pin,
    permissions,
  }: {
    name: string;
    pin: string;
    permissions: TaskPermissionValues;
  }): Promise<{ error: string | null }> {
    const { data: newId, error } = await supabase.rpc("create_staff", {
      p_outlet_id: outletId,
      p_name: name,
      p_pin: pin,
    });
    if (error) return { error: error.message };

    // create_staff always inserts with every permission defaulting to
    // true — only follow up with a direct write if the form's toggles
    // differ from that default, so a fully-on submission is a single RPC.
    const nonDefault = (Object.keys(permissions) as (keyof TaskPermissionValues)[]).some(
      (key) => permissions[key] !== DEFAULT_TASK_PERMISSIONS[key],
    );
    if (nonDefault && newId) {
      const { error: permError } = await supabase
        .from("staff")
        .update(permissions)
        .eq("id", newId);
      if (permError) return { error: permError.message };
    }

    await refresh();
    return { error: null };
  }

  async function handleResetPin(
    staffId: string,
    { pin }: { name: string; pin: string; permissions: TaskPermissionValues },
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc("set_staff_pin", {
      p_staff_id: staffId,
      p_pin: pin,
    });
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  }

  // Every direct .update() echoes back the full set of currently-known
  // editable fields (not just the one changing) — the established
  // convention on this page — with `patch` overriding whichever changed.
  async function updateStaffRow(
    row: StaffRow,
    patch: Partial<
      Pick<
        StaffRow,
        | "name"
        | "active"
        | "can_checklists"
        | "can_stock_counts"
        | "can_goods_received"
        | "can_wastage"
      >
    >,
  ) {
    setSavingId(row.id);
    const { error } = await supabase
      .from("staff")
      .update({
        name: row.name,
        active: row.active,
        can_checklists: row.can_checklists,
        can_stock_counts: row.can_stock_counts,
        can_goods_received: row.can_goods_received,
        can_wastage: row.can_wastage,
        ...patch,
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      showError(error.message);
      return false;
    }
    await refresh();
    return true;
  }

  async function toggleActive(row: StaffRow) {
    await updateStaffRow(row, { active: !row.active });
  }

  async function togglePermission(row: StaffRow, key: keyof TaskPermissionValues) {
    await updateStaffRow(row, { [key]: !row[key] });
  }

  async function saveName(row: StaffRow) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      showError(t("common.nameEmpty"));
      return;
    }
    const ok = await updateStaffRow(row, { name: trimmed });
    if (ok) setEditingId(null);
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-xl font-bold text-text">
          {t("manager.staffHeading")}
        </h2>
        <Button type="button" onClick={() => setShowAddModal(true)}>
          {t("manager.addStaff")}
        </Button>
      </div>

      {loading && <SkeletonList rows={3} rowClassName="h-16" />}
      {loadError && (
        <p className="text-danger">
          {t("common.loadStaffError", { error: loadError })}
        </p>
      )}
      {!loading && !loadError && staff.length === 0 && (
        <EmptyState title={t("manager.noStaffYet")} />
      )}

      <ul className="flex flex-col gap-3">
        {staff.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border"
          >
            <div className="flex flex-wrap items-center gap-3">
              {editingId === row.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    autoFocus
                    className="min-h-[40px] rounded-lg border border-border bg-bg px-3 py-2 text-base text-text focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={savingId === row.id}
                    onClick={() => saveName(row)}
                    className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
                  >
                    {t("common.save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="min-h-[36px] text-sm font-medium text-muted hover:text-text"
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-text">
                    {row.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditingName(row.name);
                    }}
                    className="min-h-[36px] text-sm font-medium text-muted hover:text-text"
                  >
                    {t("manager.rename")}
                  </button>
                </>
              )}
              {!row.active && (
                <span className="rounded-full bg-border/50 px-3 py-1 text-xs font-semibold text-muted">
                  {t("manager.inactive")}
                </span>
              )}
              {isLocked(row.locked_until) && (
                <span className="rounded-full bg-danger/15 px-3 py-1 text-xs font-semibold text-danger">
                  {t("manager.lockedUntil", {
                    time: formatTimeKolkata(row.locked_until!),
                  })}
                </span>
              )}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2">
              {PERMISSION_TOGGLES.map(({ key, label, icon: Icon }) => {
                const on = row[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={t(label)}
                    aria-label={t(label)}
                    aria-pressed={on}
                    disabled={savingId === row.id}
                    onClick={() => togglePermission(row, key)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-50 ${
                      on ? "bg-accent/15 text-accent" : "bg-border/50 text-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </button>
                );
              })}
              {permissionsSummary(row, t) && (
                <span className="text-xs font-medium text-muted">
                  {permissionsSummary(row, t)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResetPinFor(row)}
                className="min-h-[40px] rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-border/40 hover:text-text"
              >
                {t("manager.resetPin")}
              </button>
              <button
                type="button"
                disabled={savingId === row.id}
                onClick={() => toggleActive(row)}
                className={`min-h-[40px] rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  row.active
                    ? "bg-danger/15 text-danger"
                    : "bg-success/15 text-success"
                }`}
              >
                {row.active ? t("manager.deactivate") : t("manager.activate")}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showAddModal && (
        <StaffPinModal
          title={t("manager.addStaff")}
          showNameField
          showPermissions
          submitLabel={t("manager.add")}
          onSubmit={handleAddStaff}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {resetPinFor && (
        <StaffPinModal
          title={t("manager.resetPinTitle", { name: resetPinFor.name })}
          showNameField={false}
          submitLabel={t("common.save")}
          onSubmit={(values) => handleResetPin(resetPinFor.id, values)}
          onClose={() => setResetPinFor(null)}
        />
      )}
    </main>
  );
}
