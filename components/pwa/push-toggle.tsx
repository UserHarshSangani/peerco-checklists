"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "blocked" | "off" | "on" | "loading";

// "Phone alerts" on/off for this device. Hidden where push can't work (no
// key configured, or the browser has no push — e.g. iPhone Safari outside
// an installed home-screen app).
export function PushToggle({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  const { showError, showSuccess } = useToast();
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("on");
      showSuccess(t("team.push.turnedOn"));
    } catch (error) {
      setState("off");
      showError(t("team.push.failed", { error: (error as Error).message }));
    }
  }

  async function turnOff() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (error) {
      setState("on");
      showError(t("team.push.failed", { error: (error as Error).message }));
    }
  }

  if (state === "unsupported") return null;
  if (state === "blocked") {
    return (
      <p className={`flex items-center gap-2 text-sm text-muted ${className}`}>
        <BellOff className="h-4 w-4" aria-hidden="true" />
        {t("team.push.blocked")}
      </p>
    );
  }
  return state === "on" ? (
    <Button variant="secondary" className={className} onClick={turnOff}>
      <BellOff className="h-4 w-4" aria-hidden="true" />
      {t("team.push.turnOff")}
    </Button>
  ) : (
    <Button variant="secondary" className={className} loading={state === "loading"} onClick={turnOn}>
      <Bell className="h-4 w-4" aria-hidden="true" />
      {t("team.push.turnOn")}
    </Button>
  );
}
