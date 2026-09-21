import { useSyncExternalStore } from "react";

// Hydration-safe client-only media query check — same useSyncExternalStore
// pattern used elsewhere in this app for values that only exist in the
// browser (theme, language, touch-capability).
export function useMediaQuery(query: string): boolean {
  function subscribe(callback: () => void) {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  }
  function getSnapshot() {
    return window.matchMedia(query).matches;
  }
  function getServerSnapshot() {
    return false;
  }
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
