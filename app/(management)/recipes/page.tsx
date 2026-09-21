"use client";

import { useState } from "react";
import { useOutletContext } from "../outlet-context";
import { Button } from "@/components/ui/button";
import { UploadModal } from "./upload-modal";
import { RecipesList } from "./recipes-list";
import { RecipeEditorModal } from "./recipe-editor-modal";
import type { EditorInitial } from "./types";

function blankEditorInitial(): EditorInitial {
  return {
    recipeId: null,
    name: "",
    batchYield: "1",
    notes: "",
    active: true,
    lines: [],
  };
}

export default function RecipesPage() {
  const { selectedOutlet } = useOutletContext();
  const [showUpload, setShowUpload] = useState(false);
  const [editorInitial, setEditorInitial] = useState<EditorInitial | null>(null);
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
          <h2 className="font-serif text-xl font-bold text-text">Recipes</h2>
          {selectedOutlet.organizationName && (
            <p className="text-sm text-muted">
              Brand: {selectedOutlet.organizationName}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowUpload(true)}
          >
            Import workbook
          </Button>
          <Button type="button" onClick={() => setEditorInitial(blankEditorInitial())}>
            New recipe
          </Button>
        </div>
      </div>

      <RecipesList
        key={`${selectedOutlet.organizationId}-${reloadToken}`}
        organizationId={selectedOutlet.organizationId}
        onEdit={setEditorInitial}
        onDuplicate={setEditorInitial}
      />

      {showUpload && (
        <UploadModal
          organizationId={selectedOutlet.organizationId}
          onClose={() => setShowUpload(false)}
          onImported={() => setReloadToken((n) => n + 1)}
        />
      )}

      {editorInitial && (
        <RecipeEditorModal
          organizationId={selectedOutlet.organizationId}
          initial={editorInitial}
          onClose={() => setEditorInitial(null)}
          onSaved={() => setReloadToken((n) => n + 1)}
        />
      )}
    </main>
  );
}
