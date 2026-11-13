import React, { useState, useMemo, useEffect, useRef } from "react";
import { Search, X, TrendingUp, Layers, Check, Sparkles } from "lucide-react";
import {
  UNIVERSAL_INSTRUMENTS,
  searchInstruments,
  type UniversalInstrument,
  type AssetClass,
} from "@/lib/market-data/fo-universe";

interface SymbolSearchModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSelectSymbol: (symbol: string) => void;
  readonly activeSymbol: string;
}

export function SymbolSearchModal({
  isOpen,
  onClose,
  onSelectSymbol,
  activeSymbol,
}: SymbolSearchModalProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | AssetClass>("ALL");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    return searchInstruments(query, category);
  }, [query, category]);

  if (!isOpen) return null;

  const categories: { readonly id: "ALL" | AssetClass; readonly label: string }[] = [
    { id: "ALL", label: `All (${UNIVERSAL_INSTRUMENTS.length})` },
    { id: "INDEX", label: "Indices" },
    { id: "FO_EQUITY", label: "F&O Stocks" },
    { id: "COMMODITY", label: "Commodities" },
    { id: "CRYPTO", label: "Crypto 24/7" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Search Input */}
        <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-zinc-900/50">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 200+ F&O stocks, Indices (NIFTY, BANKNIFTY), Gold, Crypto..."
            className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 border border-white/10 rounded bg-white/5 hover:bg-white/10"
          >
            ESC
          </button>
        </div>

        {/* Category Tabs */}
        <div className="px-4 py-2 border-b border-white/5 bg-zinc-900/30 flex items-center gap-1.5 overflow-x-auto text-xs">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                category === c.id
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No instruments match &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((inst) => {
              const isSelected = inst.key === activeSymbol || inst.symbol === activeSymbol;
              return (
                <button
                  key={inst.key}
                  type="button"
                  onClick={() => {
                    onSelectSymbol(inst.key);
                    onClose();
                  }}
                  className={`w-full px-4 py-3 rounded-xl flex items-center justify-between text-left transition-all ${
                    isSelected
                      ? "bg-amber-500/10 border border-amber-500/30 text-amber-200"
                      : "hover:bg-white/5 text-zinc-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center font-mono font-bold text-xs text-amber-400">
                      {inst.symbol.slice(0, 3)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-zinc-100 font-mono tracking-wide">
                          {inst.symbol}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 border border-white/10">
                          {inst.category}
                        </span>
                        {inst.sector && (
                          <span className="text-xs text-zinc-500 hidden sm:inline">
                            · {inst.sector}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 font-sans mt-0.5">
                        {inst.name}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm text-zinc-200">
                      {inst.currency === "INR" ? "₹" : inst.currency === "USDT" ? "₮" : "$"}
                      {(inst.defaultPrice ?? 0).toLocaleString("en-IN", {
                        maximumFractionDigits: (inst.defaultPrice ?? 0) < 10 ? 4 : 2,
                      })}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Lot: {inst.lotSize}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-white/10 bg-zinc-950 text-xs text-zinc-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Universal 200+ F&O Universe with Live Upstox & CoinDCX Feeds</span>
          </div>
          <div>Press ↵ to select</div>
        </div>
      </div>
    </div>
  );
}
