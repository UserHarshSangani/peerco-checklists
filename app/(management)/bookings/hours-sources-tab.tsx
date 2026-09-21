"use client";

import { HoursEditor } from "./hours-editor";
import { ClosuresEditor } from "./closures-editor";
import { SourcesEditor } from "./sources-editor";
import type { BookingSource } from "./types";

export function HoursSourcesTab({
  outletId,
  sources,
  onSourcesChange,
}: {
  outletId: string;
  sources: BookingSource[];
  onSourcesChange: (sources: BookingSource[]) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <HoursEditor outletId={outletId} />
      <ClosuresEditor outletId={outletId} />
      <SourcesEditor outletId={outletId} sources={sources} onChange={onSourcesChange} />
    </div>
  );
}
