import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// PeerCo Pulse -> Daybook POS sync. Pulse keeps each brand's Petpooja item data; Daybook pulls
// it through Pulse's private API (Authorization: Bearer PULSE_API_SECRET) and imports it with
// public.import_pos_sales_from_pulse, which replaces those days' sales exactly like a CSV
// import and recomputes variance for them.

export type PulseBrand = {
  client_id: string;
  client_name: string;
  outlets: string[];
  latest_date: string;
};

export type PulseLink = {
  outlet_id: string;
  pulse_client_id: string;
  pulse_client_name: string;
  pulse_outlet: string | null;
  auto_sync: boolean;
  last_synced_at: string | null;
  last_sync_ok: boolean | null;
  last_sync_message: string | null;
};

export type SyncResult = {
  ok: boolean;
  message: string;
  rows_saved?: number;
  date_from?: string;
  date_to?: string;
  days_computed?: number;
  unmapped?: { pos_name: string; units: number }[];
};

function pulseConfig() {
  const base = (process.env.PULSE_API_URL || "https://peerco-pulse.vercel.app").replace(/\/+$/, "");
  const secret = process.env.PULSE_API_SECRET;
  if (!secret) throw new Error("PULSE_API_SECRET is not configured — the Pulse connection is unavailable.");
  return { base, secret };
}

async function pulseGet<T>(path: string): Promise<T> {
  const { base, secret } = pulseConfig();
  const res = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${secret}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) {
    throw new Error(`Pulse answered ${res.status}${body?.error ? `: ${body.error}` : ""}`);
  }
  return body;
}

export async function listPulseBrands(): Promise<PulseBrand[]> {
  return (await pulseGet<{ brands: PulseBrand[] }>("/api/public/daybook-outlets")).brands;
}

/** Calendar maths on YYYY-MM-DD strings. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Split [from, to] into windows Daybook's import accepts (at most 31 days each). */
export function windows(from: string, to: string, size = 31): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let start = from; start <= to; start = addDays(start, size)) {
    const end = addDays(start, size - 1);
    out.push({ from: start, to: end < to ? end : to });
  }
  return out;
}

/**
 * Pull [from, to] for one linked outlet and import it. Uses the service-role client: callers
 * must have checked who is asking (cron secret, or the user's own session) beforehand.
 */
export async function syncOutlet(
  service: SupabaseClient,
  link: Pick<PulseLink, "outlet_id" | "pulse_client_id" | "pulse_client_name" | "pulse_outlet">,
  from: string,
  to: string,
  actor: string | null,
): Promise<SyncResult> {
  let saved = 0;
  let days = 0;
  let first: string | undefined;
  let last: string | undefined;
  const unmapped = new Map<string, number>();
  const source = `Pulse: ${link.pulse_client_name}${link.pulse_outlet ? ` · ${link.pulse_outlet}` : ""}`;

  for (const w of windows(from, to)) {
    const params = new URLSearchParams({ client_id: link.pulse_client_id, from: w.from, to: w.to });
    if (link.pulse_outlet) params.set("outlet", link.pulse_outlet);
    let rows: unknown[];
    try {
      rows = (await pulseGet<{ rows: unknown[] }>(`/api/public/daybook-pos-sales?${params}`)).rows;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await service
        .from("outlet_pulse_links")
        .update({ last_synced_at: new Date().toISOString(), last_sync_ok: false, last_sync_message: message })
        .eq("outlet_id", link.outlet_id);
      return { ok: false, message };
    }
    const { data, error } = await service.rpc("import_pos_sales_from_pulse", {
      p_outlet_id: link.outlet_id,
      p_rows: rows,
      p_source_name: source,
      p_actor: actor,
    });
    if (error) return { ok: false, message: error.message };
    const r = data as {
      ok: boolean;
      reason?: string;
      rows_saved?: number;
      date_from?: string;
      date_to?: string;
      days_computed?: number;
      unmapped?: { pos_name: string; units: number }[];
    };
    if (!r.ok) return { ok: false, message: `Import refused: ${r.reason ?? "unknown"}` };
    saved += r.rows_saved ?? 0;
    days += r.days_computed ?? 0;
    if (r.date_from && (!first || r.date_from < first)) first = r.date_from;
    if (r.date_to && (!last || r.date_to > last)) last = r.date_to;
    for (const u of r.unmapped ?? []) unmapped.set(u.pos_name, (unmapped.get(u.pos_name) ?? 0) + u.units);
  }

  const message = saved
    ? `${saved} rows imported, ${first} to ${last}; variance recalculated for ${days} day${days === 1 ? "" : "s"}`
    : `No sales in Pulse between ${from} and ${to}`;
  await service
    .from("outlet_pulse_links")
    .update({ last_synced_at: new Date().toISOString(), last_sync_ok: true, last_sync_message: message })
    .eq("outlet_id", link.outlet_id);
  return {
    ok: true,
    message,
    rows_saved: saved,
    date_from: first,
    date_to: last,
    days_computed: days,
    unmapped: [...unmapped].map(([pos_name, units]) => ({ pos_name, units })).sort((a, b) => b.units - a.units),
  };
}
