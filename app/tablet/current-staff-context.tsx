"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StaffMember } from "@/lib/types";

const INACTIVITY_MS = 10 * 60 * 1000;

type CurrentStaffValue = {
  staff: StaffMember | null;
  setStaff: (staff: StaffMember | null) => void;
};

const CurrentStaffContext = createContext<CurrentStaffValue | null>(null);

// The staff member currently "signed in" on this shared kiosk tablet — kept
// in React state only (never localStorage/sessionStorage), so it never
// survives a reload and is naturally scoped to this one browser tab. Clears
// itself after 10 minutes with no pointer/key activity anywhere on the
// page, and callers clear it explicitly after a successful submit.
export function CurrentStaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaffState] = useState<StaffMember | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!staff) {
      clearTimer();
      return;
    }
    function scheduleClear() {
      clearTimer();
      timerRef.current = window.setTimeout(() => setStaffState(null), INACTIVITY_MS);
    }
    scheduleClear();
    window.addEventListener("pointerdown", scheduleClear);
    window.addEventListener("keydown", scheduleClear);
    return () => {
      clearTimer();
      window.removeEventListener("pointerdown", scheduleClear);
      window.removeEventListener("keydown", scheduleClear);
    };
  }, [staff, clearTimer]);

  const setStaff = useCallback((next: StaffMember | null) => {
    setStaffState(next);
  }, []);

  const value = useMemo(() => ({ staff, setStaff }), [staff, setStaff]);

  return (
    <CurrentStaffContext.Provider value={value}>
      {children}
    </CurrentStaffContext.Provider>
  );
}

export function useCurrentStaff() {
  const context = useContext(CurrentStaffContext);
  if (!context) {
    throw new Error("useCurrentStaff must be used within CurrentStaffProvider");
  }
  return context;
}
