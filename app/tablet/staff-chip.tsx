"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { Avatar } from "@/components/ui/avatar";
import { useCurrentStaff } from "./current-staff-context";

// "Hi, <name>" + a "Not you?" link, shown in every tablet header once a
// staff member has been picked for this session. Clearing it here doesn't
// navigate anywhere — the next PIN step just asks again.
export function StaffChip() {
  const { t } = useLanguage();
  const { staff, setStaff } = useCurrentStaff();

  if (!staff) return null;

  return (
    <div className="flex items-center gap-2">
      <Avatar name={staff.name} size="sm" />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-medium text-text">
          {t("tablet.hiName", { name: staff.name })}
        </span>
        <button
          type="button"
          onClick={() => setStaff(null)}
          className="text-left text-xs font-medium text-accent underline"
        >
          {t("tablet.notYou")}
        </button>
      </div>
    </div>
  );
}
