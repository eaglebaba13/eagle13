// Phase 27 · Stage 3 — Versioned sector constituent registry.
//
// Provider-neutral. Weights are approximate free-float weights and
// MUST be surfaced with the registry version.

export const SECTOR_REGISTRY_VERSION = "sector-registry@2025-01-30";
export const SECTOR_REGISTRY_EFFECTIVE_DATE = "2025-01-30";

export type SectorId = "BANKING" | "IT" | "OIL_GAS" | "AUTO";

export interface SectorConstituent {
  readonly symbol: string;
  readonly weight: number; // 0..1 within the sector index
}

export interface SectorDefinition {
  readonly id: SectorId;
  readonly name: string;
  readonly indexSymbol: string;
  readonly constituents: readonly SectorConstituent[];
}

export const SECTOR_REGISTRY: readonly SectorDefinition[] = [
  {
    id: "BANKING",
    name: "Banking",
    indexSymbol: "NIFTYBANK",
    constituents: [
      { symbol: "HDFCBANK",   weight: 0.29 },
      { symbol: "ICICIBANK",  weight: 0.24 },
      { symbol: "AXISBANK",   weight: 0.09 },
      { symbol: "KOTAKBANK",  weight: 0.09 },
      { symbol: "SBIN",       weight: 0.10 },
      { symbol: "INDUSINDBK", weight: 0.06 },
      { symbol: "BANKBARODA", weight: 0.04 },
      { symbol: "PNB",        weight: 0.03 },
      { symbol: "IDFCFIRSTB", weight: 0.03 },
      { symbol: "AUBANK",     weight: 0.03 },
    ],
  },
  {
    id: "IT",
    name: "IT",
    indexSymbol: "NIFTYIT",
    constituents: [
      { symbol: "INFY",       weight: 0.27 },
      { symbol: "TCS",        weight: 0.24 },
      { symbol: "HCLTECH",    weight: 0.14 },
      { symbol: "WIPRO",      weight: 0.09 },
      { symbol: "TECHM",      weight: 0.09 },
      { symbol: "LTIM",       weight: 0.06 },
      { symbol: "PERSISTENT", weight: 0.04 },
      { symbol: "COFORGE",    weight: 0.03 },
      { symbol: "MPHASIS",    weight: 0.02 },
      { symbol: "LTTS",       weight: 0.02 },
    ],
  },
  {
    id: "OIL_GAS",
    name: "Oil & Gas",
    indexSymbol: "NIFTYENERGY",
    constituents: [
      { symbol: "RELIANCE", weight: 0.34 },
      { symbol: "ONGC",     weight: 0.13 },
      { symbol: "NTPC",     weight: 0.13 },
      { symbol: "POWERGRID",weight: 0.10 },
      { symbol: "COALINDIA",weight: 0.08 },
      { symbol: "IOC",      weight: 0.06 },
      { symbol: "BPCL",     weight: 0.06 },
      { symbol: "GAIL",     weight: 0.05 },
      { symbol: "HINDPETRO",weight: 0.03 },
      { symbol: "OIL",      weight: 0.02 },
    ],
  },
  {
    id: "AUTO",
    name: "Auto",
    indexSymbol: "NIFTYAUTO",
    constituents: [
      { symbol: "M&M",        weight: 0.20 },
      { symbol: "MARUTI",     weight: 0.19 },
      { symbol: "TATAMOTORS", weight: 0.13 },
      { symbol: "BAJAJ-AUTO", weight: 0.10 },
      { symbol: "EICHERMOT",  weight: 0.08 },
      { symbol: "HEROMOTOCO", weight: 0.07 },
      { symbol: "TVSMOTOR",   weight: 0.06 },
      { symbol: "BALKRISIND", weight: 0.05 },
      { symbol: "MOTHERSON",  weight: 0.05 },
      { symbol: "ASHOKLEY",   weight: 0.04 },
    ],
  },
];

export function findSector(id: SectorId): SectorDefinition {
  const s = SECTOR_REGISTRY.find((r) => r.id === id);
  if (!s) throw new Error(`Unknown sector: ${id}`);
  return s;
}
