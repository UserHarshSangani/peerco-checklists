// Turns a notification row (kind + payload) into the words on a phone push.
// Pure; the payload holds facts, never pre-written text, so the words come
// from the team dictionary like everything else.

import { translate, type TranslationKey } from "@/lib/i18n/translations";
import { formatDateLabel, formatTimeKolkata } from "@/lib/date";
import { formatINR } from "@/lib/team/money";

export type PushMessage = { title: string; body: string; url: string; tag: string };

type Payload = Record<string, unknown>;

// Where tapping the push takes you.
const URLS: Record<string, string> = {
  cover_offer: "/me",
  cover_taken: "/me",
  cover_awarded: "/me",
  cover_cancelled: "/me",
  leave_decided: "/me",
  cover_filled: "/team/cover",
  cover_unfilled: "/team/cover",
  cover_accepted: "/team/cover",
  leave_requested: "/team/leave",
  attendance_no_show: "/team/attendance",
  attendance_late: "/team/attendance",
  attendance_auto_closed: "/team/attendance",
  staff_profile_updated: "/team/staff",
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function vars(payload: Payload): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) out[k] = str(v);
  for (const k of ["date", "from", "to"]) if (payload[k]) out[k] = formatDateLabel(str(payload[k]));
  if (payload.at) out.at = formatTimeKolkata(str(payload.at));
  out.amount = typeof payload.amount_paise === "number" ? formatINR(payload.amount_paise) : "";
  return out;
}

/** Null for kinds we don't push (or `leave_cancelled` without its side). */
export function pushMessage(kind: string, payload: Payload, id: string): PushMessage | null {
  let k = kind;
  if (kind === "leave_decided") k = payload.approved ? "leave_approved" : "leave_rejected";
  if (kind === "leave_cancelled") k = payload.staff_id ? "leave_cancelled_by_staff" : "leave_cancelled_by_manager";
  if (kind === "cover_offer" && typeof payload.amount_paise !== "number") k = "cover_offer_comp_off";
  const titleKey = `team.push.${k}.title` as TranslationKey;
  const bodyKey = `team.push.${k}.body` as TranslationKey;
  let title: string;
  let body: string;
  try {
    title = translate("en", titleKey);
    body = translate("en", bodyKey);
  } catch {
    return null;
  }
  if (!title || !body) return null;
  const v = vars(payload);
  const url = kind === "leave_cancelled" && payload.staff_id ? "/team/leave" : URLS[kind] ?? "/";
  return { title: fill(title, v), body: fill(body, v), url, tag: `${kind}:${str(payload.request_id) || id}` };
}
