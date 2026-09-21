"use client";

import { useState } from "react";

export type RecipeOption = { id: string; name: string };

export function RecipeCombobox({
  recipes,
  value,
  onChange,
}: {
  recipes: RecipeOption[];
  value: RecipeOption | null;
  onChange: (recipe: RecipeOption | null) => void;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);

  // Keep the input text in sync when the parent resets `value` out from
  // under us (e.g. after Ignore/Unmap) — adjusting state during render
  // (not in an effect) is the sanctioned way to derive state from a prop
  // change without an extra render round-trip.
  const [syncedValueId, setSyncedValueId] = useState(value?.id ?? null);
  if (syncedValueId !== (value?.id ?? null)) {
    setSyncedValueId(value?.id ?? null);
    setQuery(value?.name ?? "");
  }

  const filtered = query.trim()
    ? recipes
        .filter((recipe) =>
          recipe.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .slice(0, 20)
    : recipes.slice(0, 20);

  return (
    <div className="relative w-56">
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (!event.target.value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Search recipe…"
        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg bg-surface py-1 shadow-lg ring-1 ring-border">
          {filtered.map((recipe) => (
            <li key={recipe.id}>
              <button
                type="button"
                onMouseDown={() => {
                  onChange(recipe);
                  setQuery(recipe.name);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-text hover:bg-border/30"
              >
                {recipe.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
