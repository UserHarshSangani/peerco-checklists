"use client";

import { OutletProvider, type ManagedOutlet } from "./outlet-context";
import { AppFrame } from "./app-frame";
import { OutletPicker } from "./outlet-picker";

export function ManagementShell({
  outlets,
  role,
  userName,
  children,
}: {
  outlets: ManagedOutlet[];
  role: string | null;
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <OutletProvider outlets={outlets}>
      <AppFrame role={role} userName={userName} outletPicker={<OutletPicker />}>
        {children}
      </AppFrame>
    </OutletProvider>
  );
}
