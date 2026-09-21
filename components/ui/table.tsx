import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";

// Thin styled wrappers around the native table elements — drop-in
// replacements for hand-rolled <table>/<thead>/<tbody> markup that add a
// sticky header and zebra-striped rows without a data-driven abstraction,
// so existing tables can adopt them with a small, mechanical edit.
export function Table({ className = "", ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-border">
      <table className={`min-w-full border-collapse text-sm ${className}`} {...props} />
    </div>
  );
}

export function TableHead({ className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={`sticky top-0 z-10 bg-surface after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border ${className}`}
      {...props}
    />
  );
}

export function TableBody({ className = "", ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={`[&>tr:nth-child(even)]:bg-bg/50 [&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 ${className}`}
      {...props}
    />
  );
}

export function Th({ className = "", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 py-3 text-left font-semibold text-muted ${className}`}
      {...props}
    />
  );
}

export function Td({ className = "", ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`px-4 py-3 text-text ${className}`} {...props} />;
}
