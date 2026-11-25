import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";

export type IndicatorCategory = "structure" | "options" | "astro";

export interface ChartIndicatorItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly category: IndicatorCategory;
  readonly active: boolean;
  readonly accentClass: string;
  readonly onToggle: () => void;
}

export interface IndicatorsDropdownProps {
  readonly items: readonly ChartIndicatorItem[];
  readonly isOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onResetDefaults?: () => void;
  readonly onHideAll?: () => void;
}

const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
  structure: "Structure & Orderflow",
  options: "Options & Institutional Flow",
  astro: "Gann & Astro",
};

const CATEGORY_ORDER: readonly IndicatorCategory[] = ["structure", "options", "astro"];

export function filterIndicatorItems(
  items: readonly ChartIndicatorItem[],
  query: string,
): ChartIndicatorItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      CATEGORY_LABELS[item.category].toLowerCase().includes(q),
  );
}

export function IndicatorsDropdown({
  items,
  isOpen: controlledOpen,
  onOpenChange,
  onResetDefaults,
  onHideAll,
}: IndicatorsDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [isOpen]);

  const activeCount = useMemo(() => items.filter((i) => i.active).length, [items]);
  const filtered = useMemo(() => filterIndicatorItems(items, query), [items, query]);

  const grouped = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      title: CATEGORY_LABELS[category],
      items: filtered.filter((i) => i.category === category),
    })).filter((group) => group.items.length > 0);
  }, [filtered]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition-all flex items-center gap-1.5 cursor-pointer ${
          isOpen || activeCount > 0
            ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:border-amber-500/70"
            : "bg-[#11161f] text-zinc-300 border-white/10 hover:border-white/25"
        }`}
        title="Indicators & Overlays"
      >
        <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
        <span className="hidden sm:inline">Indicators</span>
        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold tabular-nums">
          {activeCount}
        </span>
        <ChevronDown className={`w-3 h-3 text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Chart indicators"
          className="absolute right-0 top-full mt-1.5 w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-amber-500/30 bg-[#090c10]/95 shadow-2xl backdrop-blur-md z-50 overflow-hidden"
        >
          {/* Search Header */}
          <div className="p-2.5 border-b border-white/10 bg-[#11161f]/80">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search indicators..."
                autoFocus
                className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-[#090c10] border border-white/10 text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 text-zinc-500 hover:text-zinc-200 cursor-pointer"
                  aria-label="Clear indicator search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Categorized List */}
          <div className="max-h-80 overflow-y-auto p-2 space-y-3">
            {grouped.length === 0 ? (
              <div className="py-6 text-center text-xs font-mono text-zinc-500">
                No indicators match "{query}"
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.category}>
                  <div className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold">
                    {group.title}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={item.active}
                        onClick={item.onToggle}
                        className={`w-full px-2.5 py-2 rounded-lg text-left transition-all flex items-center justify-between gap-2 cursor-pointer border ${
                          item.active
                            ? "bg-[#141b26] border-amber-500/30 text-zinc-100"
                            : "border-transparent hover:bg-white/5 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-semibold flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${item.accentClass}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-500 truncate mt-0.5">
                            {item.description}
                          </div>
                        </div>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            item.active
                              ? "bg-amber-500/20 border-amber-400/60 text-amber-300"
                              : "bg-zinc-900 border-white/15 text-transparent"
                          }`}
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-3 py-2 border-t border-white/10 bg-[#11161f]/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-500 tabular-nums">
              Active: <strong className="text-zinc-200">{activeCount}</strong> / {items.length}
            </span>
            <div className="flex items-center gap-2">
              {onHideAll && activeCount > 0 && (
                <button
                  type="button"
                  onClick={onHideAll}
                  className="text-zinc-400 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  Hide All
                </button>
              )}
              {onResetDefaults && (
                <button
                  type="button"
                  onClick={onResetDefaults}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
