"use client";

import { useState } from "react";
import { useOutletContext } from "../outlet-context";
import { Button } from "@/components/ui/button";
import { UploadModal } from "./upload-modal";
import { RecipesList } from "./recipes-list";

export default function RecipesPage() {
  const { selectedOutlet } = useOutletContext();
  const [showUpload, setShowUpload] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  if (!selectedOutlet) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-muted">Choose an outlet to manage its recipes.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text">Recipes</h2>
          {selectedOutlet.organizationName && (
            <p className="text-sm text-muted">
              Brand: {selectedOutlet.organizationName}
            </p>
          )}
        </div>
        <Button type="button" onClick={() => setShowUpload(true)}>
          Import workbook
        </Button>
      </div>

      <RecipesList
        key={`${selectedOutlet.organizationId}-${reloadToken}`}
        organizationId={selectedOutlet.organizationId}
      />

      {showUpload && (
        <UploadModal
          organizationId={selectedOutlet.organizationId}
          onClose={() => setShowUpload(false)}
          onImported={() => setReloadToken((n) => n + 1)}
        />
      )}
    </main>
  );
}
