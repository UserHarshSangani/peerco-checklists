"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { IconCircle, type IconTone } from "./icon-circle";

// A collapsible group of items with an icon, title and a "done/total" tally
// — used to group checklist items by section on /tablet.
export function SectionCard({
  icon,
  iconTone = "accent",
  title,
  done,
  total,
  defaultOpen = true,
  onOpenChange,
  children,
}: {
  icon: ReactNode;
  iconTone?: IconTone;
  title: string;
  done: number;
  total: number;
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
        <span className="flex-1 text-base font-semibold text-text">{title}</span>
        <span className="shrink-0 text-sm font-medium text-muted">
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
