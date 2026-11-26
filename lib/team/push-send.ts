import "server-only";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { pushMessage } from "@/lib/team/push-text";

// Sends phone pushes for notifications that haven't been pushed yet (last
// hour only). Each row is claimed by setting push_sent_at first, so two
// runs at once never send the same push twice. Subscriptions the push
// service says are gone (404/410) are deleted.

const BATCH = 200;

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function flushPush(): Promise<{ sent: number; failed: number; removed: number; skipped?: string }> {
  if (!pushConfigured()) return { sent: 0, failed: 0, removed: 0, skipped: "not_configured" };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL || "https://peerco-checklists.vercel.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const supabase = createServiceRoleClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data: pending, error } = await supabase
    .from("notifications")
    .select("id")
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(BATCH);
  if (error) throw new Error(error.message);
  if (!pending?.length) return { sent: 0, failed: 0, removed: 0 };

  const { data: claimed, error: claimError } = await supabase
    .from("notifications")
    .update({ push_sent_at: new Date().toISOString() })
    .in("id", pending.map((p) => p.id))
    .is("push_sent_at", null)
    .select("id, recipient_profile_id, kind, payload");
  if (claimError) throw new Error(claimError.message);
  if (!claimed?.length) return { sent: 0, failed: 0, removed: 0 };

  const recipients = [...new Set(claimed.map((n) => n.recipient_profile_id as string))];
  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, profile_id, endpoint, keys")
    .in("profile_id", recipients);
  if (subsError) throw new Error(subsError.message);

  let sent = 0;
  let failed = 0;
  const gone = new Set<string>();
  await Promise.all(
    claimed.map(async (n) => {
      const message = pushMessage(n.kind as string, (n.payload ?? {}) as Record<string, unknown>, n.id as string);
      if (!message) return;
      for (const s of subs ?? []) {
        if (s.profile_id !== n.recipient_profile_id || gone.has(s.id)) continue;
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
            JSON.stringify(message),
            { TTL: 3600, urgency: "high" },
          );
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.add(s.id);
          else failed++;
        }
      }
    }),
  );
  if (gone.size) await supabase.from("push_subscriptions").delete().in("id", [...gone]);
  return { sent, failed, removed: gone.size };
}
