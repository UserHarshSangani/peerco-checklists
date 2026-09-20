"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { useLanguage } from "@/lib/i18n/language-context";
import { useOutletContext } from "../outlet-context";
import { StaffPinModal } from "./staff-pin-modal";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

type StaffRow = {
  id: string;
  name: string;
  active: boolean;
  locked_until: string | null;
};

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
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [resetPinFor, setResetPinFor] = useState<StaffRow | null>(null);

  // Only ever these four columns — never pin_hash, never select("*").
  async function fetchStaff() {
    return supabase
      .from("staff")
      .select("id, name, active, locked_until")
      .eq("outlet_id", outletId)
      .order("name");
  }

  async function refresh() {
    const { data, error } = await fetchStaff();
    if (error) {
      setActionError(error.message);
      return;
    }
    setActionError(null);
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
  }: {
    name: string;
    pin: string;
  }): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc("create_staff", {
      p_outlet_id: outletId,
      p_name: name,
      p_pin: pin,
    });
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  }

  async function handleResetPin(
    staffId: string,
    { pin }: { name: string; pin: string },
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.rpc("set_staff_pin", {
      p_staff_id: staffId,
      p_pin: pin,
    });
    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  }

  async function toggleActive(row: StaffRow) {
    setSavingId(row.id);
    setActionError(null);
    const { error } = await supabase
      .from("staff")
      .update({ name: row.name, active: !row.active })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    await refresh();
  }

  async function saveName(row: StaffRow) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setActionError(t("common.nameEmpty"));
      return;
    }
    setSavingId(row.id);
    setActionError(null);
    const { error } = await supabase
      .from("staff")
      .update({ name: trimmed, active: row.active })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      setActionError(error.message);
      return;
    }
    setEditingId(null);
    await refresh();
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-text">
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
      {actionError && (
        <p className="mb-4 text-sm font-medium text-danger">{actionError}</p>
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
                    className="min-h-[36px] rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
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
