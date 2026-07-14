// Shared planet visual tokens.
// Extracted from live-terminal.tsx, live-levels.tsx and astro.tsx to remove
// the identical PLANET_STYLE table + orbStyle() helper that lived in all
// three routes. Pure presentation constants — no formulas changed.
import type React from "react";

export type PlanetVisual = { orb: string; glow: string; line: string };

export const PLANET_STYLE: Record<string, PlanetVisual> = {
  Sun: { orb: "radial-gradient(circle at 35% 30%, #ffe9a8, #f5a623 55%, #b8620b)", glow: "rgba(245,166,35,0.6)", line: "#f5a623" },
  Moon: { orb: "radial-gradient(circle at 35% 30%, #ffffff, #cfd8e3 55%, #8b98a8)", glow: "rgba(207,216,227,0.55)", line: "#cfd8e3" },
  Mercury: { orb: "radial-gradient(circle at 35% 30%, #c7f7d4, #34d399 55%, #0f7a4f)", glow: "rgba(52,211,153,0.55)", line: "#34d399" },
  Venus: { orb: "radial-gradient(circle at 35% 30%, #ffe3ec, #f4a6c0 55%, #c76b8e)", glow: "rgba(244,166,192,0.55)", line: "#f4a6c0" },
  Mars: { orb: "radial-gradient(circle at 35% 30%, #ffb4a0, #ef4444 55%, #7f1d1d)", glow: "rgba(239,68,68,0.6)", line: "#ef4444" },
  Jupiter: { orb: "radial-gradient(circle at 35% 30%, #fff2b0, #eab308 55%, #a16207)", glow: "rgba(234,179,8,0.6)", line: "#eab308" },
  Saturn: { orb: "radial-gradient(circle at 35% 30%, #cfe0ee, #64748b 55%, #334155)", glow: "rgba(100,116,139,0.55)", line: "#94a3b8" },
  Rahu: { orb: "radial-gradient(circle at 35% 30%, #e9d5ff, #a855f7 55%, #6b21a8)", glow: "rgba(168,85,247,0.6)", line: "#a855f7" },
  Ketu: { orb: "radial-gradient(circle at 35% 30%, #ffd9b0, #f97316 55%, #9a3412)", glow: "rgba(249,115,22,0.6)", line: "#f97316" },
};

/** Returns the CSS custom-property style block for a planet orb. */
export function orbStyle(planet: string): React.CSSProperties {
  const s = PLANET_STYLE[planet] ?? { orb: "#888", glow: "rgba(255,255,255,0.35)", line: "#888" };
  return { ["--orb" as any]: s.orb, ["--orb-glow" as any]: s.glow };
}