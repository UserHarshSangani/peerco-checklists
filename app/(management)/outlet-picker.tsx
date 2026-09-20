"use client";

import { useOutletContext, type ManagedOutlet } from "./outlet-context";

export function OutletPicker() {
  const { outlets, selectedOutlet, setSelectedOutletId } = useOutletContext();

  if (outlets.length === 0) {
    return (
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No outlets are assigned to your account yet.
        </p>
      </div>
    );
  }

  const groups = new Map<string, ManagedOutlet[]>();
  for (const outlet of outlets) {
    const key = outlet.organizationName ?? "Outlets";
    const list = groups.get(key) ?? [];
    list.push(outlet);
    groups.set(key, list);
  }
  const showGroups = groups.size > 1;

  return (
    <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <label
        htmlFor="outlet-picker"
        className="text-sm font-medium text-zinc-600 dark:text-zinc-300"
      >
        Outlet
      </label>
      <select
        id="outlet-picker"
        value={selectedOutlet?.id ?? ""}
        onChange={(event) => setSelectedOutletId(event.target.value)}
        className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
      >
        {showGroups
          ? Array.from(groups.entries()).map(([groupName, groupOutlets]) => (
              <optgroup key={groupName} label={groupName}>
                {groupOutlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </optgroup>
            ))
          : outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
      </select>
    </div>
  );
}
