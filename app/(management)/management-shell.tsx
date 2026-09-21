"use client";

import { OutletProvider, type ManagedOutlet } from "./outlet-context";
import { Nav } from "./nav";
import { OutletPicker } from "./outlet-picker";

export function ManagementShell({
  outlets,
  role,
  children,
}: {
  outlets: ManagedOutlet[];
  role: string | null;
  children: React.ReactNode;
}) {
  return (
    <OutletProvider outlets={outlets}>
      <div className="flex min-h-dvh flex-col bg-bg">
        <Nav role={role} />
        <OutletPicker />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </OutletProvider>
  );
}
