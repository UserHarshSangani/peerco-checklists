import {
  ChefHat,
  Clipboard,
  Package,
  Receipt,
  Store,
  type LucideIcon,
} from "lucide-react";

const KEYWORD_ICONS: { keyword: string; icon: LucideIcon }[] = [
  { keyword: "kitchen", icon: ChefHat },
  { keyword: "cash", icon: Receipt },
  { keyword: "storage", icon: Package },
  { keyword: "front of house", icon: Store },
];

export function sectionIcon(section: string | null): LucideIcon {
  if (section) {
    const lower = section.toLowerCase();
    const match = KEYWORD_ICONS.find((entry) => lower.includes(entry.keyword));
    if (match) return match.icon;
  }
  return Clipboard;
}

export const GENERAL_SECTION_LABEL = "General";
