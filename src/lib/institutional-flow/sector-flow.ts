// Phase 3D — Sector flow view.
// Consumes existing Market Breadth sector snapshots. Never fetches directly.

import type { MarketBreadthSnapshot } from "@/lib/market-breadth/types";
import type { SectorFlow, SectorFlowRow, CalcAvailability } from "./types";

/** Canonical sector display order used by the dashboard. */
export const SECTOR_DISPLAY_ORDER: readonly {
  readonly id: string;
  readonly name: string;
  readonly universeSuffix: string;
}[] = [
  { id: "BANKING",    name: "Banking",     universeSuffix: "BANKING" },
  { id: "IT",         name: "IT",          universeSuffix: "IT" },
  { id: "AUTO",       name: "Auto",        universeSuffix: "AUTO" },
  { id: "OIL_GAS",    name: "Oil & Gas",   universeSuffix: "OIL_GAS" },
  { id: "FMCG",       name: "FMCG",        universeSuffix: "FMCG" },
  { id: "PHARMA",     name: "Pharma",      universeSuffix: "PHARMA" },
  { id: "FINANCIALS", name: "Financials",  universeSuffix: "FINANCIALS" },
  { id: "METALS",     name: "Metals",      universeSuffix: "METALS" },
];

function biasFrom(net: number | null, weighted: number | null): SectorFlowRow["bias"] {
  if (net == null && weighted == null) return "UNAVAILABLE";
  const w = weighted ?? net ?? 0;
  if (w > 0.05) return "BULLISH";
  if (w < -0.05) return "BEARISH";
  return "NEUTRAL";
}

export interface SectorFlowInput {
  readonly sectors: readonly MarketBreadthSnapshot[];
  readonly registryVersion?: string | null;
}

export function buildSectorFlow(input: SectorFlowInput): SectorFlow {
  const bySuffix = new Map<string, MarketBreadthSnapshot>();
  for (const s of input.sectors) {
    const suffix = s.universe.startsWith("SECTOR_") ? s.universe.slice("SECTOR_".length) : s.universe;
    bySuffix.set(suffix, s);
  }

  const rows: SectorFlowRow[] = SECTOR_DISPLAY_ORDER.map((def) => {
    const snap = bySuffix.get(def.universeSuffix) ?? null;
    if (!snap) {
      return {
        id: def.id,
        name: def.name,
        advances: null,
        declines: null,
        netBreadth: null,
        weightedBreadth: null,
        bias: "UNAVAILABLE" as const,
        coverage: null,
      };
    }
    return {
      id: def.id,
      name: def.name,
      advances: snap.advances,
      declines: snap.declines,
      netBreadth: snap.netBreadth,
      weightedBreadth: snap.weightedBreadth,
      bias: biasFrom(snap.netBreadth, snap.weightedBreadth),
      coverage: snap.constituentCoverage,
    };
  });

  const available = rows.filter((r) => r.bias !== "UNAVAILABLE").length;
  const availability: CalcAvailability =
    available === 0 ? "UNAVAILABLE" : available === rows.length ? "OK" : "PARTIAL";

  return { rows, availability, registryVersion: input.registryVersion ?? null };
}