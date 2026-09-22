"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { IconCircle, type IconTone } from "./icon-circle";

// A collapsible group of items with an icon, title and a "done/total" tally
// — used to group checklist items by section on /tablet, and by the Orders
// vendor groups. `titleClassName`/`tallyClassName` default to the original
// sizing so every existing caller is unaffected; a caller that wants a
// smaller step (e.g. the checklist screen) passes its own classes instead
// of this component's own default text size changing for everyone.
export function SectionCard({
  icon,
  iconTone = "accent",
  title,
  titleClassName = "text-base font-semibold text-text",
  done,
  total,
  tallyClassName = "text-sm font-medium text-muted",
  defaultOpen = true,
  onOpenChange,
  children,
}: {
  icon: ReactNode;
  iconTone?: IconTone;
  title: string;
  titleClassName?: string;
  done: number;
  total: number;
  tallyClassName?: string;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const complete = total > 0 && done === total;

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  }

  return (
    <section className="rounded-2xl bg-surface shadow-sm ring-1 ring-border">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <IconCircle icon={icon} tone={complete ? "success" : iconTone} size="sm" />
        <span className={`flex-1 ${titleClassName}`}>{title}</span>
        <span className={`shrink-0 ${tallyClassName}`}>
          {done}/{total}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-muted transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </section>
  );
}
