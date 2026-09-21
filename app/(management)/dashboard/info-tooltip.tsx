"use client";

import { useState } from "react";
import { Info } from "lucide-react";

// A tap/click-to-toggle info popover (not hover-only, so it works on
// touch) explaining what a KPI number means.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onBlur={() => setOpen(false)}
        aria-label="What does this mean?"
        aria-expanded={open}
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-text"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-6 left-1/2 z-20 w-56 -translate-x-1/2 rounded-xl bg-text px-3 py-2 text-xs font-medium text-bg shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
