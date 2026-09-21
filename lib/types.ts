export type Outlet = {
  id: string;
  name: string;
};

export type ChecklistTemplate = {
  id: string;
  name: string;
};

export type ChecklistItemRow = {
  id: string;
  label: string;
  required: boolean;
  position: number;
  requires_photo: boolean;
  section: string | null;
};

export type StaffMember = {
  id: string;
  name: string;
};

// From get_count_sheet / get_entry_lists — same shape either way.
export type CountSheetItem = {
  item_id: string;
  name: string;
  category: string | null;
  unit: string;
};

export type EntryListVendor = {
  vendor_id: string;
  name: string;
};

export type WastageReason =
  | "spoilage"
  | "prep_waste"
  | "breakage"
  | "staff_meal"
  | "complimentary"
  | "other";

export type EntryLists = {
  items: CountSheetItem[];
  vendors: EntryListVendor[];
  wastage_reasons: WastageReason[];
};

// /catalog, /outlets settings tab — manager-facing catalog rows.
export type Vendor = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

export type InventoryItemRow = {
  id: string;
  name: string;
  category: string | null;
  count_unit: string;
  order_unit: string | null;
  order_unit_size: number;
  cost_per_unit: number | null;
  vendor_id: string | null;
  count_frequency: "daily" | "weekly";
  active: boolean;
  recipe_unit: "g" | "ml" | "pcs" | null;
  recipe_factor: number;
};

export type OutletItemRow = {
  outlet_id: string;
  item_id: string;
  par_level: number | null;
  max_level: number | null;
  lead_time_days: number;
  active: boolean;
  track_variance: boolean;
  variance_tolerance_pct: number;
  variance_tolerance_qty: number;
};
