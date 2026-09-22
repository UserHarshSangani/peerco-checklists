"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

export type TaskKey = "checklists" | "stock_counts" | "goods_received" | "wastage";

export type StaffTaskPermissions = Record<TaskKey, boolean>;
export type PermissionsMap = Record<string, StaffTaskPermissions>;

type TaskPermissionsValue = {
  permissions: PermissionsMap | null;
  refresh: () => void;
  isAllowed: (staffId: string, task: TaskKey) => boolean;
  anyoneCan: (task: TaskKey) => boolean;
};

const TaskPermissionsContext = createContext<TaskPermissionsValue | null>(null);

// A convenience-only cache of get_staff_permissions for this outlet's
// tablet session. Fetched once when the home screen for this outlet loads
// and refreshed whenever the caller returns to it (see exitToHome in
// tablet-app.tsx) — never persisted, never the real enforcement. Every
// submit RPC checks the same permission again in the database regardless
// of what this cache says, so a stale or missing entry here just means a
// worse hint, not a security gap.
export function TaskPermissionsProvider({
  outletId,
  children,
}: {
  outletId: string;
  children: ReactNode;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null);

  const refresh = useCallback(() => {
    supabase
      .rpc("get_staff_permissions", { p_outlet_id: outletId })
      .then(({ data, error }) => {
        if (error) return;
        setPermissions((data ?? {}) as PermissionsMap);
      });
  }, [supabase, outletId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outletId]);

  const isAllowed = useCallback(
    (staffId: string, task: TaskKey) => {
      // Fail open on the client while we don't (yet) know — the database
      // still enforces this at submit time either way.
      if (!permissions) return true;
      const entry = permissions[staffId];
      if (!entry) return true;
      return entry[task] !== false;
    },
    [permissions],
  );

  const anyoneCan = useCallback(
    (task: TaskKey) => {
      if (!permissions) return true;
      return Object.values(permissions).some((entry) => entry[task]);
    },
    [permissions],
  );

  const value = useMemo<TaskPermissionsValue>(
    () => ({ permissions, refresh, isAllowed, anyoneCan }),
    [permissions, refresh, isAllowed, anyoneCan],
  );

  return (
    <TaskPermissionsContext.Provider value={value}>
      {children}
    </TaskPermissionsContext.Provider>
  );
}

export function useTaskPermissions() {
  const context = useContext(TaskPermissionsContext);
  if (!context) {
    throw new Error("useTaskPermissions must be used within TaskPermissionsProvider");
  }
  return context;
}
