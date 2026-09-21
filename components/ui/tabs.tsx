export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1 rounded-full bg-surface p-1 ring-1 ring-border"
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`min-h-[40px] flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
              active ? "bg-accent text-accent-fg" : "text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
