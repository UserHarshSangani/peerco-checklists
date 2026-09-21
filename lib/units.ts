// Mirrors private.unit_factor() exactly — the database derives
// inventory_items.recipe_factor from this same pairing, and rejects any
// other combination with a 23514 check violation.
export type RecipeUnit = "g" | "ml" | "pcs";

const FACTORS: Record<string, number> = {
  "g:kg": 1000,
  "g:g": 1,
  "ml:l": 1000,
  "ml:ml": 1,
  "pcs:pcs": 1,
};

export function recipeUnitFactor(
  recipeUnit: RecipeUnit | "" | null,
  countUnit: string,
): number | null {
  if (!recipeUnit || !countUnit) return null;
  return FACTORS[`${recipeUnit}:${countUnit}`] ?? null;
}

// A blank recipe unit ("not used in recipes") is always valid, regardless
// of the stock unit — the mismatch only matters once a recipe unit is set.
export function isValidRecipeUnitPair(
  recipeUnit: RecipeUnit | "" | null,
  countUnit: string,
): boolean {
  if (!recipeUnit) return true;
  return recipeUnitFactor(recipeUnit, countUnit) != null;
}

export const RECIPE_UNIT_MISMATCH_MESSAGE =
  "Grams work with kg or g; ml works with l or ml; pieces work with pcs.";

export function isRecipeUnitMismatchError(error: { code?: string }): boolean {
  return error.code === "23514";
}
