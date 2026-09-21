export const ACK_REASONS: { value: string; label: string }[] = [
  { value: "counting_error", label: "Counting error" },
  { value: "recipe_needs_update", label: "Recipe needs updating" },
  { value: "portion_drift", label: "Portion drift" },
  { value: "uncounted_wastage", label: "Uncounted wastage" },
  { value: "comp_or_staff_meal", label: "Complimentary or staff meal" },
  { value: "short_delivery", label: "Short delivery" },
  { value: "unexplained_loss", label: "Unexplained loss" },
  { value: "other", label: "Other" },
];

export const ACK_REASON_LABEL: Record<string, string> = Object.fromEntries(
  ACK_REASONS.map((reason) => [reason.value, reason.label]),
);

export type VarianceStatus =
  | "ok"
  | "explained"
  | "shortage"
  | "surplus"
  | "missing_count"
  | "missing_sales"
  | "no_recipe";

export const STATUS_BADGE_CLASSNAME: Record<VarianceStatus, string> = {
  shortage: "bg-danger/15 text-danger",
  surplus: "bg-warning/15 text-warning",
  explained: "bg-accent/15 text-accent",
  ok: "bg-success/15 text-success",
  missing_count: "bg-border/50 text-muted",
  missing_sales: "bg-border/50 text-muted",
  no_recipe: "bg-border/50 text-muted",
};

export const STATUS_LABEL: Record<VarianceStatus, string> = {
  shortage: "Shortage",
  surplus: "Surplus",
  explained: "Explained",
  ok: "OK",
  missing_count: "Missing count",
  missing_sales: "Missing sales",
  no_recipe: "No recipe",
};

export const NOT_EVALUATED_EXPLANATION: Record<string, string> = {
  missing_count:
    "Not evaluated: today's stock count wasn't completed for this item.",
  missing_sales:
    "Not evaluated: no sales data has been imported for this day yet.",
  no_recipe:
    "Not evaluated: this item isn't used in any recipe mapped to a sold dish yet.",
};
