"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Link2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { formatDateLabel, formatTimeKolkata } from "@/lib/date";
import type { PulseBrand, PulseLink, SyncResult } from "@/lib/pulse/sync";

type LinkResponse = {
  ok: boolean;
  link: PulseLink | null;
  canEdit: boolean;
  brands: PulseBrand[] | null;
  brandsError: string | null;
};

const ALL = "";
const kolkataDate = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));
const selectClass =
  "w-full rounded-lg border border-border bg-bg px-4 py-3 text-base text-text focus:border-accent focus:outline-none";

// PeerCo Pulse connection for the selected outlet: which Pulse brand feeds it, the last
// sync, a "Sync from Pulse" button, and (PeerCo admins) linking.
export function PulsePanel({ outletId, onSynced }: { outletId: string; onSynced: () => void }) {
  const [state, setState] = useState<LinkResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [outletName, setOutletName] = useState(ALL);
  const [autoSync, setAutoSync] = useState(true);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState(7);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const fetchLink = useCallback(async (): Promise<LinkResponse | null> => {
    const res = await fetch(`/api/pulse/link?outlet_id=${outletId}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as LinkResponse | null;
    return res.ok && body?.ok ? body : null;
  }, [outletId]);

  const apply = useCallback((body: LinkResponse | null) => {
    if (!body) {
      setLoadError("Couldn't load the Pulse connection.");
      return;
    }
    setLoadError(null);
    setState(body);
    setBrandId(body.link?.pulse_client_id ?? "");
    setOutletName(body.link?.pulse_outlet ?? ALL);
    setAutoSync(body.link?.auto_sync ?? true);
  }, []);

  const load = useCallback(async () => apply(await fetchLink()), [apply, fetchLink]);

  // The panel is keyed by outlet, so switching outlets starts it fresh.
  useEffect(() => {
    let cancelled = false;
    fetchLink().then((body) => {
      if (!cancelled) apply(body);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchLink, apply]);

  async function save() {
    const brand = state?.brands?.find((b) => b.client_id === brandId);
    if (!brand) return;
    setSaving(true);
    const res = await fetch("/api/pulse/link", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outlet_id: outletId,
        pulse_client_id: brand.client_id,
        pulse_client_name: brand.client_name,
        pulse_outlet: outletName || null,
        auto_sync: autoSync,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      await load();
    } else setLoadError("Couldn't save the link.");
  }

  async function unlink() {
    setSaving(true);
    await fetch(`/api/pulse/link?outlet_id=${outletId}`, { method: "DELETE" });
    setSaving(false);
    setEditing(false);
    await load();
  }

  async function sync() {
    setSyncing(true);
    setResult(null);
    const res = await fetch("/api/pulse/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outlet_id: outletId, days }),
    });
    const body = (await res.json().catch(() => null)) as SyncResult | null;
    setSyncing(false);
    setResult(body ?? { ok: false, message: "Sync failed." });
    if (body?.ok) onSynced();
    await load();
  }

  if (loadError && !state) return <p className="mb-6 text-danger">{loadError}</p>;
  if (!state) return null;
  const { link, canEdit, brands } = state;
  const brand = brands?.find((b) => b.client_id === brandId);

  return (
    <section className="mb-6 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold text-text">
            <Link2 className="h-4 w-4" aria-hidden /> PeerCo Pulse
          </h3>
          {link ? (
            <p className="mt-1 text-sm text-muted">
              Sales come from <b className="text-text">{link.pulse_client_name}</b>
              {link.pulse_outlet ? ` · ${link.pulse_outlet}` : " · all outlets"}
              {link.auto_sync ? ", synced every morning (last 7 days)." : ", synced only when you press Sync."}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Not linked. {canEdit ? "Link this outlet to its brand in Pulse to pull sales automatically." : "Ask PeerCo to link this outlet to Pulse."}
            </p>
          )}
          {link?.last_synced_at && (
            <div className="mt-2">
              <StatusPill
                tone={link.last_sync_ok ? "success" : "danger"}
                icon={link.last_sync_ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
              >
                Last sync {formatDateLabel(kolkataDate(link.last_synced_at))}, {formatTimeKolkata(link.last_synced_at)}:{" "}
                {link.last_sync_message}
              </StatusPill>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {link && (
            <>
              <select
                aria-label="Days to sync"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-lg border border-border bg-bg px-3 py-3 text-sm text-text"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <Button type="button" onClick={sync} loading={syncing}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Sync from Pulse
              </Button>
            </>
          )}
          {canEdit && !editing && (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              {link ? "Change link" : "Link to Pulse"}
            </Button>
          )}
        </div>
      </div>

      {result && (
        <div className={`mt-3 rounded-xl p-3 text-sm ${result.ok ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg"}`}>
          {result.message}
          {result.ok && (result.unmapped?.length ?? 0) > 0 && (
            <div className="mt-1">
              {result.unmapped!.length} POS item{result.unmapped!.length === 1 ? " is" : "s are"} not mapped to a recipe yet, so
              they don&apos;t count in variance. Map them under Mapping.
            </div>
          )}
        </div>
      )}

      {editing && canEdit && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          {state.brandsError && (
            <p className="text-sm text-danger sm:col-span-2">Couldn&apos;t reach Pulse: {state.brandsError}</p>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-muted">Pulse brand</span>
            <select
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                setOutletName(ALL);
              }}
              className={selectClass}
            >
              <option value="">Choose a brand…</option>
              {(brands ?? []).map((b) => (
                <option key={b.client_id} value={b.client_id}>
                  {b.client_name} (till data to {formatDateLabel(b.latest_date)})
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-muted">Outlet on the bills</span>
            <select
              value={outletName}
              onChange={(e) => setOutletName(e.target.value)}
              className={selectClass}
              disabled={!brand}
            >
              <option value={ALL}>All outlets of the brand</option>
              {(brand?.outlets ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
            <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="h-5 w-5" />
            Sync automatically every morning
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" onClick={save} loading={saving} disabled={!brand}>
              Save link
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            {link && (
              <Button type="button" variant="danger" onClick={unlink} loading={saving} className="sm:ml-auto">
                Unlink
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
