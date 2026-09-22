import type { RecipeUnit } from "@/lib/units";

export type IngredientOption = {
  id: string;
  name: string;
  category: string | null;
  recipe_unit: RecipeUnit;
  recipe_factor: number;
  pack_buffer_units: number;
  cost_per_unit: number | null;
};

export type RecipeLineDraft = {
  localId: string;
  item_id: string;
  name: string;
  category: string | null;
  // Null only for a line whose ingredient had its recipe unit cleared in
  // Catalog after this recipe was saved — kept so the line isn't silently
  // dropped, shown with a warning instead.
  recipe_unit: RecipeUnit | null;
  recipe_factor: number;
  pack_buffer_units: number;
  cost_per_unit: number | null;
  quantity: string;
  note: string;
};

export type EditorInitial = {
  recipeId: string | null;
  name: string;
  batchYield: string;
  notes: string;
  active: boolean;
  lines: RecipeLineDraft[];
};
