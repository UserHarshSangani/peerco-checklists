// Mirrors private.unit_factor() / private.inventory_items_recipe_factor():
// g/ml (and pcs paired with a pcs stock unit) have a fixed factor the
// database derives on its own. pcs paired with any other stock unit is a
// manual pack — e.g. "packet", "tray", "box" — whose recipe_factor (pieces
// per pack) and pack_buffer_units the user enters, both still validated
// and enforced by the database.
export type RecipeUnit = "g" | "ml" | "pcs";

const AUTO_FACTORS: Record<string, number> = {
  "g:kg": 1000,
  "g:g": 1,
  "ml:l": 1000,
  "ml:ml": 1,
  "pcs:pcs": 1,
};

// The database-derived factor, for the pairings where recipe_factor is
// automatic. Returns null both for a genuine mismatch (g without kg/g) and
// for a manual pack (pcs + a custom stock unit) — use isManualPackUnit to
// tell those two apart.
export function recipeUnitFactor(
  recipeUnit: RecipeUnit | "" | null,
  countUnit: string,
): number | null {
  if (!recipeUnit || !countUnit) return null;
  return AUTO_FACTORS[`${recipeUnit}:${countUnit}`] ?? null;
}

// True once recipe_factor becomes a manually-entered "pieces per pack"
// value (and pack_buffer_units becomes editable) instead of one the
// database derives automatically.
export function isManualPackUnit(
  recipeUnit: RecipeUnit | "" | null,
  countUnit: string,
): boolean {
  const trimmed = countUnit.trim();
  return recipeUnit === "pcs" && trimmed !== "" && trimmed !== "pcs";
}

// A blank recipe unit ("not used in recipes") is always valid, regardless
// of the stock unit. g/ml need a matching stock unit (kg/g, l/ml); pcs
// pairs with any stock unit — pcs:pcs is automatic, anything else is a
// manual pack.
export function isValidRecipeUnitPair(
  recipeUnit: RecipeUnit | "" | null,
  countUnit: string,
): boolean {
  if (!recipeUnit) return true;
  if (recipeUnit === "pcs") return countUnit.trim() !== "";
  return recipeUnitFactor(recipeUnit, countUnit) != null;
}

export const RECIPE_UNIT_MISMATCH_MESSAGE =
  "Grams work with kg or g; ml works with l or ml; pieces work with any stock unit.";

// Only the genuine "recipe unit doesn't match stock unit" violation (g/ml
// paired wrong). The database's separate pieces-per-pack and buffer checks
// share the same 23514 check-violation code but come with their own clear
// message, so callers should surface error.message for those as-is rather
// than replacing it with RECIPE_UNIT_MISMATCH_MESSAGE.
export function isRecipeUnitMismatchError(error: {
  code?: string;
  message?: string;
}): boolean {
  return error.code === "23514" && !!error.message?.includes("does not match stock unit");
}
