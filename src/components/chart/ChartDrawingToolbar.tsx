import React from "react";
import {
  Crosshair,
  Slash,
  Minus,
  SlidersHorizontal,
  Square,
  ArrowUpRight,
  ArrowDownRight,
  Ruler,
  Magnet,
  Trash2,
} from "lucide-react";
import type { DrawingToolType } from "@/lib/chart/drawing-types";

interface ChartDrawingToolbarProps {
  readonly activeTool: DrawingToolType;
  readonly onSelectTool: (tool: DrawingToolType) => void;
  readonly isMagnet: boolean;
  readonly onToggleMagnet: () => void;
  readonly onClearDrawings: () => void;
  readonly drawingsCount: number;
}

export function ChartDrawingToolbar({
  activeTool,
  onSelectTool,
  isMagnet,
  onToggleMagnet,
  onClearDrawings,
  drawingsCount,
}: ChartDrawingToolbarProps) {
  const tools: { readonly id: DrawingToolType; readonly label: string; readonly icon: React.ReactNode }[] = [
    {
      id: "cursor",
      label: "Crosshair (Pan/Zoom)",
      icon: <Crosshair className="w-4 h-4" />,
    },
    {
      id: "trendline",
      label: "Trendline & Ray",
      icon: <Slash className="w-4 h-4" />,
    },
    {
      id: "horizontal",
      label: "Horizontal Support/Resistance Line",
      icon: <Minus className="w-4 h-4" />,
    },
    {
      id: "fibonacci",
      label: "Fibonacci Retracement (Golden Pocket)",
      icon: <SlidersHorizontal className="w-4 h-4" />,
    },
    {
      id: "rectangle",
      label: "Supply & Demand Zone Box",
      icon: <Square className="w-4 h-4" />,
    },
    {
      id: "riskRewardLong",
      label: "Long Risk/Reward Position Tool",
      icon: <ArrowUpRight className="w-4 h-4 text-emerald-400" />,
    },
    {
      id: "riskRewardShort",
      label: "Short Risk/Reward Position Tool",
      icon: <ArrowDownRight className="w-4 h-4 text-rose-400" />,
    },
    {
      id: "ruler",
      label: "Price & Percentage Range Ruler",
      icon: <Ruler className="w-4 h-4" />,
    },
  ];

  return (
    <aside
      className="flex flex-col items-center gap-1 p-1 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl z-20 select-none"
      title="TradingView Institutional Drawing Toolbar"
    >
      {tools.map((t) => {
        const isActive = activeTool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTool(t.id)}
            title={t.label}
            className={`p-2 rounded-md transition-all flex items-center justify-center relative group ${
              isActive
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
            }`}
          >
            {t.icon}
            {/* Tooltip */}
            <span className="absolute left-full ml-2 px-2 py-1 text-[11px] font-medium text-zinc-200 bg-zinc-900 border border-white/10 rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              {t.label}
            </span>
          </button>
        );
      })}

      <div className="w-5 h-[1px] bg-white/10 my-1" />

      {/* Magnet Mode Toggle */}
      <button
        type="button"
        onClick={onToggleMagnet}
        title={isMagnet ? "Magnet Mode ON (Snap to OHLC)" : "Magnet Mode OFF"}
        className={`p-2 rounded-md transition-all flex items-center justify-center relative group ${
          isMagnet
            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
        }`}
      >
        <Magnet className="w-4 h-4" />
        <span className="absolute left-full ml-2 px-2 py-1 text-[11px] font-medium text-zinc-200 bg-zinc-900 border border-white/10 rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
          Magnet Snap: {isMagnet ? "ACTIVE" : "OFF"}
        </span>
      </button>

      {/* Clear All Drawings */}
      <button
        type="button"
        onClick={onClearDrawings}
        disabled={drawingsCount === 0}
        title={`Clear Drawings (${drawingsCount})`}
        className={`p-2 rounded-md transition-all flex items-center justify-center relative group ${
          drawingsCount > 0
            ? "text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
            : "text-zinc-700 cursor-not-allowed"
        }`}
      >
        <Trash2 className="w-4 h-4" />
        <span className="absolute left-full ml-2 px-2 py-1 text-[11px] font-medium text-zinc-200 bg-zinc-900 border border-white/10 rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
          Clear All Drawings ({drawingsCount})
        </span>
      </button>
    </aside>
  );
}
