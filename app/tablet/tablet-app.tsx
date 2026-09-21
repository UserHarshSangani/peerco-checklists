"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayInKolkata, formatDateLabelForLocale } from "@/lib/date";
import { useWakeLock } from "@/lib/use-wake-lock";
import { useLanguage } from "@/lib/i18n/language-context";
import { APP_NAME } from "@/lib/brand";
import type { ChecklistTemplate, Outlet, StaffMember } from "@/lib/types";
import { ChecklistView } from "./checklist-view";
import { StockCountFlow } from "./stock/stock-count-flow";
import { GoodsReceivedFlow } from "./stock/goods-received-flow";
import { WastageFlow } from "./stock/wastage-flow";
import { StaffPickerScreen } from "./staff-picker-screen";
import { CurrentStaffProvider, useCurrentStaff } from "./current-staff-context";
import { StaffChip } from "./staff-chip";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/language/language-switcher";
import { IconCircle } from "@/components/ui/icon-circle";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InstallHint } from "@/components/pwa/install-hint";
import {
  ClipboardCheck,
  ChefHat as WastageIcon,
  PackageSearch,
  Truck,
} from "lucide-react";

type HomeTile = "checklists" | "stock-count" | "goods-received" | "wastage";

export function TabletApp({ outlets }: { outlets: Outlet[] }) {
  const [selectedOutlet, setSelectedOutlet] = useState<Outlet | null>(
    outlets.length === 1 ? outlets[0] : null,
  );

  // The tablet is meant to sit on a counter and stay lit the whole shift.
  useWakeLock(true);

  function chooseOutlet(outlet: Outlet | null) {
    setSelectedOutlet(outlet);
  }

  if (outlets.length === 0) {
    return <NoOutlets />;
  }

  if (!selectedOutlet) {
    return <ChooseOutlet outlets={outlets} onChoose={chooseOutlet} />;
  }

  return (
    <CurrentStaffProvider key={selectedOutlet.id}>
      <OutletHome
        outlet={selectedOutlet}
        multiOutlet={outlets.length > 1}
        onSwitchOutlet={() => chooseOutlet(null)}
      />
    </CurrentStaffProvider>
  );
}

function NoOutlets() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <main className="flex flex-1 items-center justify-center p-6">
        <EmptyState title={t("common.noOutlets")} />
      </main>
      <InstallHint />
    </div>
  );
}

function ChooseOutlet({
  outlets,
  onChoose,
}: {
  outlets: Outlet[];
  onChoose: (outlet: Outlet) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="safe-top flex items-center justify-between border-b border-border bg-surface px-4 py-3 sm:px-6">
        <span className="font-serif text-xl font-bold text-text">{APP_NAME}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-6">
        <h2 className="mb-6 text-xl font-semibold text-text">
          {t("tablet.chooseOutlet")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {outlets.map((outlet) => (
            <button
              key={outlet.id}
              type="button"
              onClick={() => onChoose(outlet)}
              className="min-h-16 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              {outlet.name}
            </button>
          ))}
        </div>
      </main>
      <InstallHint />
    </div>
  );
}

function OutletHome({
  outlet,
  multiOutlet,
  onSwitchOutlet,
}: {
  outlet: Outlet;
  multiOutlet: boolean;
  onSwitchOutlet: () => void;
}) {
  const { t, locale } = useLanguage();
  const currentStaff = useCurrentStaff();
  const [activeTile, setActiveTile] = useState<HomeTile | null>(null);
  const [pendingTile, setPendingTile] = useState<HomeTile | null>(null);
  const [activeTemplate, setActiveTemplate] =
    useState<ChecklistTemplate | null>(null);

  const today = useMemo(
    () => formatDateLabelForLocale(todayInKolkata(), locale),
    [locale],
  );

  function openTile(tile: HomeTile) {
    if (currentStaff.staff) {
      setActiveTile(tile);
    } else {
      setPendingTile(tile);
    }
  }

  function handleStaffPicked(member: StaffMember) {
    currentStaff.setStaff(member);
    setActiveTile(pendingTile);
    setPendingTile(null);
  }

  function exitToHome() {
    setActiveTile(null);
    setActiveTemplate(null);
  }

  const header = (
    <header className="safe-top sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <p className="truncate font-serif text-lg font-bold text-text">{outlet.name}</p>
        <p className="text-sm text-muted">{today}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StaffChip />
        {multiOutlet && (
          <button
            type="button"
            onClick={onSwitchOutlet}
            className="min-h-[40px] rounded-full px-3 py-2 text-sm font-medium text-muted transition hover:bg-border/40 hover:text-text"
          >
            {t("tablet.switchOutlet")}
          </button>
        )}
        <LanguageSwitcher />
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );

  if (pendingTile) {
    return (
      <StaffPickerScreen
        outlet={outlet}
        onPick={handleStaffPicked}
        onCancel={() => setPendingTile(null)}
      />
    );
  }

  if (activeTemplate) {
    return (
      <ChecklistView
        key={activeTemplate.id}
        outlet={outlet}
        template={activeTemplate}
        onBack={() => setActiveTemplate(null)}
        onSubmitted={exitToHome}
      />
    );
  }

  if (activeTile === "stock-count") {
    return <StockCountFlow key={outlet.id} outlet={outlet} onExit={exitToHome} />;
  }
  if (activeTile === "goods-received") {
    return <GoodsReceivedFlow key={outlet.id} outlet={outlet} onExit={exitToHome} />;
  }
  if (activeTile === "wastage") {
    return <WastageFlow key={outlet.id} outlet={outlet} onExit={exitToHome} />;
  }
  if (activeTile === "checklists") {
    return (
      <TemplatesList
        key={outlet.id}
        outlet={outlet}
        onSelect={setActiveTemplate}
        onBack={exitToHome}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {header}
      <main className="flex-1 p-4 sm:p-6">
        <h2 className="mb-6 font-serif text-2xl font-bold text-text">
          {t("tablet.home.heading")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HomeTileButton
            icon={<ClipboardCheck className="h-full w-full" />}
            tone="accent"
            label={t("tablet.home.checklists")}
            onClick={() => openTile("checklists")}
          />
          <HomeTileButton
            icon={<PackageSearch className="h-full w-full" />}
            tone="info"
            label={t("tablet.home.stockCount")}
            onClick={() => openTile("stock-count")}
          />
          <HomeTileButton
            icon={<Truck className="h-full w-full" />}
            tone="success"
            label={t("tablet.home.goodsReceived")}
            onClick={() => openTile("goods-received")}
          />
          <HomeTileButton
            icon={<WastageIcon className="h-full w-full" />}
            tone="warning"
            label={t("tablet.home.wastage")}
            onClick={() => openTile("wastage")}
          />
        </div>
      </main>
      <InstallHint />
    </div>
  );
}

function HomeTileButton({
  icon,
  tone,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  tone: "accent" | "success" | "warning" | "info";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-32 items-center gap-4 rounded-3xl bg-surface p-6 text-left shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
    >
      <IconCircle icon={icon} tone={tone} size="lg" />
      <span className="text-2xl font-semibold text-text">{label}</span>
    </button>
  );
}

function TemplatesList({
  outlet,
  onSelect,
  onBack,
}: {
  outlet: Outlet;
  onSelect: (template: ChecklistTemplate) => void;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const supabase = useMemo(() => createClient(), []);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("checklist_templates")
      .select("id, name")
      .eq("outlet_id", outlet.id)
      .eq("active", true)
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          setLoadError(error.message);
          return;
        }
        setTemplates(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, outlet.id]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <main className="flex-1 p-4 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 min-h-[40px] text-sm font-medium text-muted hover:text-text"
        >
          ‹ {t("common.back")}
        </button>
        <h2 className="mb-6 text-xl font-semibold text-text">
          {t("common.checklistsHeading")}
        </h2>
        {loading && <SkeletonList rows={3} rowClassName="h-24" />}
        {loadError && (
          <p className="text-danger">
            {t("common.loadChecklistsError", { error: loadError })}
          </p>
        )}
        {!loading && !loadError && templates.length === 0 && (
          <EmptyState title={t("common.noActiveChecklists")} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(template)}
              className="min-h-16 rounded-2xl bg-surface p-6 text-left text-xl font-medium text-text shadow-sm ring-1 ring-border transition hover:bg-border/20 active:scale-[0.98]"
            >
              {template.name}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
