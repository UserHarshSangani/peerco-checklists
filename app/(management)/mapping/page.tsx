"use client";

import { useMemo } from "react";
import { useOutletContext } from "../outlet-context";
import { MappingTable } from "./mapping-table";

export default function MappingPage() {
  const { outlets, selectedOutlet } = useOutletContext();

  const outletIds = useMemo(
    () =>
      selectedOutlet
        ? outlets
            .filter((outlet) => outlet.organizationId === selectedOutlet.organizationId)
            .map((outlet) => outlet.id)
        : [],
    [outlets, selectedOutlet],
  );

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to manage its brand&apos;s mapping.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-text">Mapping</h2>
        {selectedOutlet.organizationName && (
          <p className="text-sm text-muted">
            Brand: {selectedOutlet.organizationName}
          </p>
        )}
      </div>

      <MappingTable
        key={selectedOutlet.organizationId}
        organizationId={selectedOutlet.organizationId}
        outletIds={outletIds}
      />
    </main>
  );
}
