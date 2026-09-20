"use client";

import { useEffect, useRef } from "react";

// Keeps the screen awake while `enabled` is true. Silently does nothing on
// browsers without the Wake Lock API (e.g. desktop Safari) — there is no
// user-visible fallback because there's nothing meaningful to show.
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function requestLock() {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Permission denied or unsupported in this context — no-op.
      }
    }

    requestLock();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !sentinelRef.current) {
        requestLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [enabled]);
}
