"use client";

import { useState } from "react";
import { useOutletContext } from "../outlet-context";
import { Button } from "@/components/ui/button";
import { ImportModal } from "./import-modal";
import { ImportHistory } from "./import-history";

export default function SalesPage() {
  const { selectedOutlet } = useOutletContext();
  const [showImport, setShowImport] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to manage its sales.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-text">Sales</h2>
        <Button type="button" onClick={() => setShowImport(true)}>
          Import sales
        </Button>
      </div>

      <h3 className="mb-3 text-base font-semibold text-text">Import history</h3>
      <ImportHistory
        key={`${selectedOutlet.id}-${reloadToken}`}
        outletId={selectedOutlet.id}
      />

      {showImport && (
        <ImportModal
          outletId={selectedOutlet.id}
          onClose={() => setShowImport(false)}
          onImported={() => setReloadToken((n) => n + 1)}
        />
      )}
    </main>
  );
}
