"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTimeKolkata } from "@/lib/date";
import { useOutletContext } from "../outlet-context";
import { StaffPinModal } from "./staff-pin-modal";

type StaffRow = {
  id: string;
  name: string;
  active: boolean;
  locked_until: string | null;
};

export default function StaffPage() {
  const { selectedOutlet } = useOutletContext();

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">
          Choose an outlet to manage its staff.
        </p>
      </main>
    );
  }

  return <StaffForOutlet key={selectedOutlet.id} outletId={selectedOutlet.id} />;
}

function isLocked(lockedUntil: string | null): boolean {
  return lockedUntil != null && new Date(lockedUntil).getTime() > Date.now();
}

function StaffForOutlet({ outletId }: { outletId: string }) {
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
      setActionError("Name can't be empty.");
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
    <main className="flex-1 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Staff
        </h2>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add staff
        </button>
      </div>

      {loading && <p className="text-zinc-500 dark:text-zinc-400">Loading…</p>}
      {loadError && (
        <p className="text-red-600 dark:text-red-400">
          Couldn&apos;t load staff: {loadError}
        </p>
      )}
      {actionError && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">
          {actionError}
        </p>
      )}
      {!loading && !loadError && staff.length === 0 && (
        <p className="text-zinc-500 dark:text-zinc-400">
          No staff yet. Add your first staff member.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {staff.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
          >
            <div className="flex flex-wrap items-center gap-3">
              {editingId === row.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    autoFocus
                    className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-base text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  />
                  <button
                    type="button"
                    disabled={savingId === row.id}
                    onClick={() => saveName(row)}
                    className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                    {row.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditingName(row.name);
                    }}
                    className="text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                  >
                    Rename
                  </button>
                </>
              )}
              {!row.active && (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Inactive
                </span>
              )}
              {isLocked(row.locked_until) && (
                <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-400">
                  Locked until {formatTimeKolkata(row.locked_until!)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setResetPinFor(row)}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Reset PIN
              </button>
              <button
                type="button"
                disabled={savingId === row.id}
                onClick={() => toggleActive(row)}
                className={`rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                  row.active
                    ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                }`}
              >
                {row.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showAddModal && (
        <StaffPinModal
          title="Add staff"
          showNameField
          submitLabel="Add"
          onSubmit={handleAddStaff}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {resetPinFor && (
        <StaffPinModal
          title={`Reset PIN for ${resetPinFor.name}`}
          showNameField={false}
          submitLabel="Save"
          onSubmit={(values) => handleResetPin(resetPinFor.id, values)}
          onClose={() => setResetPinFor(null)}
        />
      )}
    </main>
  );
}
