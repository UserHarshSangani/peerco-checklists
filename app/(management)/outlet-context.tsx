"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

export type ManagedOutlet = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string | null;
};

type OutletContextValue = {
  outlets: ManagedOutlet[];
  selectedOutlet: ManagedOutlet | null;
  setSelectedOutletId: (id: string) => void;
};

const OutletContext = createContext<OutletContextValue | null>(null);
const STORAGE_KEY = "peerco:selected-outlet";
const listeners = new Set<() => void>();

function readStoredOutletId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOutletId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage can be unavailable (private mode); the pick just won't
    // be remembered for next time.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getServerSnapshot(): string | null {
  return null;
}

export function OutletProvider({
  outlets,
  children,
}: {
  outlets: ManagedOutlet[];
  children: React.ReactNode;
}) {
  const storedId = useSyncExternalStore(
    subscribe,
    readStoredOutletId,
    getServerSnapshot,
  );

  const selectedOutlet = useMemo(() => {
    if (storedId) {
      const remembered = outlets.find((outlet) => outlet.id === storedId);
      if (remembered) return remembered;
    }
    return outlets[0] ?? null;
  }, [outlets, storedId]);

  const value = useMemo<OutletContextValue>(
    () => ({
      outlets,
      selectedOutlet,
      setSelectedOutletId: writeStoredOutletId,
    }),
    [outlets, selectedOutlet],
  );

  return (
    <OutletContext.Provider value={value}>{children}</OutletContext.Provider>
  );
}

export function useOutletContext() {
  const context = useContext(OutletContext);
  if (!context) {
    throw new Error("useOutletContext must be used within OutletProvider");
  }
  return context;
}
