"use client";

import { useOutletContext, type ManagedOutlet } from "./outlet-context";
import { useLanguage } from "@/lib/i18n/language-context";

export function OutletPicker() {
  const { outlets, selectedOutlet, setSelectedOutletId } = useOutletContext();
  const { t } = useLanguage();

  if (outlets.length === 0) {
    return (
      <div className="border-b border-border bg-surface px-6 py-4">
        <p className="text-sm text-muted">{t("common.noOutlets")}</p>
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
    <div className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
      <label
        htmlFor="outlet-picker"
        className="text-sm font-medium text-muted"
      >
        {t("manager.outlet")}
      </label>
      <select
        id="outlet-picker"
        value={selectedOutlet?.id ?? ""}
        onChange={(event) => setSelectedOutletId(event.target.value)}
        className="min-h-[40px] rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
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
