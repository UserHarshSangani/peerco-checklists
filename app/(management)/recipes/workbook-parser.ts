import * as XLSX from "xlsx";

const VALID_RECIPE_UNITS = new Set(["g", "ml", "pcs"]);

const DISHES_SHEET = "Dishes";
const RECIPES_SHEET = "Recipes";
const INGREDIENTS_SHEET = "Ingredients";

const COL = {
  dishPosName: "Dish name in POS (Petpooja)",
  dishRecipeName: "Recipe name to use",
  dishPortion: "Portion sold per unit (1 = whole portion)",
  recipeName: "Recipe name",
  recipeYield: "Batch makes (number of portions)",
  recipeIngredient: "Ingredient",
  recipeQuantity: "Quantity for the whole batch",
  ingredientName: "Ingredient",
  ingredientCategory: "Category",
  ingredientRecipeUnit: "Unit in recipes",
  ingredientCountUnit: "Unit we count in stock",
  notes: "Notes",
} as const;

export type ParsedIngredient = {
  name: string;
  category: string | null;
  recipe_unit: string;
  count_unit: string;
};

export type ParsedRecipeLine = { ingredient: string; quantity: number };
export type ParsedRecipe = {
  name: string;
  batch_yield: number;
  lines: ParsedRecipeLine[];
};

export type ParsedDish = {
  pos_name: string;
  recipe_name: string;
  portion: number;
};

export type WorkbookParseResult = {
  ingredients: ParsedIngredient[];
  recipes: ParsedRecipe[];
  dishes: ParsedDish[];
  counts: { recipes: number; lines: number; newIngredients: number };
  blockingErrors: string[];
  warnings: string[];
};

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

function text(value: unknown): string {
  return isBlank(value) ? "" : String(value).trim();
}

function startsWithExample(value: unknown): boolean {
  const s = text(value);
  return s.toUpperCase().startsWith("EXAMPLE");
}

function toNumber(value: unknown): number | null {
  if (isBlank(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function findSheetName(workbook: XLSX.WorkBook, target: string): string | null {
  return (
    workbook.SheetNames.find(
      (name) => name.trim().toLowerCase() === target.toLowerCase(),
    ) ?? null
  );
}

function sheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string | null,
): Record<string, unknown>[] {
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
}

export async function parseRecipeWorkbook(
  file: File,
): Promise<WorkbookParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  const dishesSheetName = findSheetName(workbook, DISHES_SHEET);
  const recipesSheetName = findSheetName(workbook, RECIPES_SHEET);
  const ingredientsSheetName = findSheetName(workbook, INGREDIENTS_SHEET);

  if (!dishesSheetName) blockingErrors.push('Missing a "Dishes" sheet.');
  if (!recipesSheetName) blockingErrors.push('Missing a "Recipes" sheet.');
  if (!ingredientsSheetName) {
    blockingErrors.push('Missing an "Ingredients" sheet.');
  }
  if (blockingErrors.length > 0) {
    return {
      ingredients: [],
      recipes: [],
      dishes: [],
      counts: { recipes: 0, lines: 0, newIngredients: 0 },
      blockingErrors,
      warnings,
    };
  }

  // --- Ingredients sheet: one row per ingredient ---
  const ingredientRows = sheetRows(workbook, ingredientsSheetName).filter(
    (row) =>
      !isBlank(row[COL.ingredientName]) &&
      !startsWithExample(row[COL.ingredientName]) &&
      !startsWithExample(row[COL.notes]),
  );
  const ingredientsByName = new Map<
    string,
    { category: string | null; recipe_unit: string; count_unit: string }
  >();
  for (const row of ingredientRows) {
    const name = text(row[COL.ingredientName]);
    ingredientsByName.set(name.toLowerCase(), {
      category: text(row[COL.ingredientCategory]) || null,
      recipe_unit: text(row[COL.ingredientRecipeUnit]),
      count_unit: text(row[COL.ingredientCountUnit]),
    });
  }

  // --- Recipes sheet: one row per recipe-ingredient line, grouped by recipe ---
  const recipeRows = sheetRows(workbook, recipesSheetName).filter(
    (row) =>
      !(isBlank(row[COL.recipeName]) && isBlank(row[COL.recipeIngredient])) &&
      !startsWithExample(row[COL.recipeName]) &&
      !startsWithExample(row[COL.notes]),
  );

  type RecipeAccumulator = {
    name: string;
    yields: number[];
    lines: ParsedRecipeLine[];
  };
  const recipesByName = new Map<string, RecipeAccumulator>();

  for (const row of recipeRows) {
    const name = text(row[COL.recipeName]);
    if (!name) {
      blockingErrors.push(
        `A row in "Recipes" has an ingredient but no recipe name.`,
      );
      continue;
    }
    const key = name.toLowerCase();
    const acc = recipesByName.get(key) ?? { name, yields: [], lines: [] };

    const yieldRaw = row[COL.recipeYield];
    if (!isBlank(yieldRaw)) {
      const y = toNumber(yieldRaw);
      if (y != null) acc.yields.push(y);
    }

    const ingredientName = text(row[COL.recipeIngredient]);
    if (ingredientName) {
      const quantity = toNumber(row[COL.recipeQuantity]);
      if (quantity == null || quantity <= 0) {
        blockingErrors.push(
          `"${name}": quantity for "${ingredientName}" is not a positive number.`,
        );
      } else {
        acc.lines.push({ ingredient: ingredientName, quantity });
      }
      if (!ingredientsByName.has(ingredientName.toLowerCase())) {
        blockingErrors.push(
          `"${name}": ingredient "${ingredientName}" is not in the Ingredients sheet.`,
        );
      }
    }

    recipesByName.set(key, acc);
  }

  const recipes: ParsedRecipe[] = [];
  for (const acc of recipesByName.values()) {
    const distinctYields = Array.from(new Set(acc.yields));
    if (distinctYields.length === 0) {
      blockingErrors.push(
        `"${acc.name}": missing "Batch makes" (batch yield).`,
      );
      continue;
    }
    if (distinctYields.length > 1) {
      blockingErrors.push(
        `"${acc.name}": "Batch makes" has conflicting values (${distinctYields.join(", ")}).`,
      );
      continue;
    }
    const batchYield = distinctYields[0];
    if (batchYield <= 0) {
      blockingErrors.push(`"${acc.name}": batch yield must be positive.`);
      continue;
    }
    if (acc.lines.length === 0) {
      blockingErrors.push(`"${acc.name}": has no ingredient lines.`);
      continue;
    }
    recipes.push({ name: acc.name, batch_yield: batchYield, lines: acc.lines });
  }

  // Ingredients actually used by a (valid) recipe line, with their unit checked.
  const usedIngredientNames = new Set<string>();
  for (const recipe of recipes) {
    for (const line of recipe.lines) {
      usedIngredientNames.add(line.ingredient.toLowerCase());
    }
  }
  const ingredients: ParsedIngredient[] = [];
  for (const key of usedIngredientNames) {
    const info = ingredientsByName.get(key);
    if (!info) continue; // already reported as "unknown ingredient" above
    if (!VALID_RECIPE_UNITS.has(info.recipe_unit)) {
      blockingErrors.push(
        `Ingredient "${key}": unit "${info.recipe_unit || "(blank)"}" must be g, ml or pcs.`,
      );
      continue;
    }
    // recover original-cased name from the first matching ingredient row
    const original = ingredientRows.find(
      (row) => text(row[COL.ingredientName]).toLowerCase() === key,
    );
    ingredients.push({
      name: original ? text(original[COL.ingredientName]) : key,
      category: info.category,
      recipe_unit: info.recipe_unit,
      count_unit: info.count_unit,
    });
  }

  // --- Dishes sheet ---
  const dishRows = sheetRows(workbook, dishesSheetName).filter(
    (row) =>
      !isBlank(row[COL.dishPosName]) && !startsWithExample(row[COL.notes]),
  );
  const dishes: ParsedDish[] = [];
  const recipeNamesInWorkbook = new Set(
    recipes.map((recipe) => recipe.name.toLowerCase()),
  );
  for (const row of dishRows) {
    const posName = text(row[COL.dishPosName]);
    const recipeName = text(row[COL.dishRecipeName]);
    const portion = toNumber(row[COL.dishPortion]) ?? 0;
    dishes.push({ pos_name: posName, recipe_name: recipeName, portion });

    if (recipeName && portion <= 0) {
      warnings.push(`"${posName}" has a recipe but no portion set.`);
    }
    if (
      recipeName &&
      portion > 0 &&
      !recipeNamesInWorkbook.has(recipeName.toLowerCase())
    ) {
      warnings.push(
        `"${posName}" points to recipe "${recipeName}", which isn't in this workbook (it must already exist, with lines, in the catalog).`,
      );
    }
  }

  const lineCount = recipes.reduce((sum, recipe) => sum + recipe.lines.length, 0);

  return {
    ingredients,
    recipes,
    dishes,
    counts: {
      recipes: recipes.length,
      lines: lineCount,
      newIngredients: ingredients.length,
    },
    blockingErrors,
    warnings,
  };
}
