import {
  BookOpen,
  Building2,
  CalendarClock,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  Contact,
  FileSignature,
  FileSpreadsheet,
  LayoutDashboard,
  Link2,
  Package,
  Receipt,
  Scale,
  Settings,
  SlidersHorizontal,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "OPERATE" | "ANALYSE" | "TEAM" | "SET UP";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Roles that can see this item — omit to show it to every management role. */
  roles?: ("peerco_admin" | "owner" | "manager")[];
};

// The exact, role-filtered item set from the approved nav — admin/owner see
// all of it, manager sees everything except Sales, Mapping and Outlets.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, group: "OPERATE" },
  { href: "/checklists", label: "Checklists", icon: ClipboardCheck, group: "OPERATE" },
  { href: "/stock", label: "Stock", icon: Package, group: "OPERATE" },
  { href: "/orders", label: "Orders", icon: ClipboardList, group: "OPERATE" },
  { href: "/bookings", label: "Bookings", icon: CalendarClock, group: "OPERATE" },
  {
    href: "/sales",
    label: "Sales",
    icon: Receipt,
    group: "ANALYSE",
    roles: ["peerco_admin", "owner"],
  },
  { href: "/variance", label: "Variance", icon: Scale, group: "ANALYSE" },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet, group: "ANALYSE" },
  { href: "/team/staff", label: "People", icon: Contact, group: "TEAM" },
  {
    href: "/team/letter",
    label: "Appointment letter",
    icon: FileSignature,
    group: "TEAM",
    roles: ["peerco_admin", "owner"],
  },
  { href: "/team/settings", label: "Team settings", icon: SlidersHorizontal, group: "TEAM" },
  { href: "/catalog", label: "Catalog", icon: BookOpen, group: "SET UP" },
  { href: "/recipes", label: "Recipes", icon: ChefHat, group: "SET UP" },
  {
    href: "/mapping",
    label: "Mapping",
    icon: Link2,
    group: "SET UP",
    roles: ["peerco_admin", "owner"],
  },
  { href: "/staff", label: "Staff", icon: Users, group: "SET UP" },
  {
    href: "/outlets",
    label: "Outlets",
    icon: Store,
    group: "SET UP",
    roles: ["peerco_admin", "owner"],
  },
  {
    href: "/admin/clients",
    label: "Clients",
    icon: Building2,
    group: "SET UP",
    roles: ["peerco_admin"],
  },
  { href: "/settings", label: "Settings", icon: Settings, group: "SET UP" },
];

export const NAV_GROUPS: NavGroup[] = ["OPERATE", "ANALYSE", "TEAM", "SET UP"];

export function navItemsForRole(role: string | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || (role && item.roles.includes(role as never)),
  );
}

// The condensed set shown in the mobile bottom tab bar for every
// management role (device/tablet logins never see this bar at all).
export const BOTTOM_TAB_HREFS = ["/dashboard", "/stock", "/variance", "/staff"];
export const BOTTOM_TAB_LABELS: Record<string, string> = {
  "/dashboard": "Today",
  "/stock": "Stock",
  "/variance": "Variance",
  "/staff": "Staff",
};
