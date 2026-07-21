// Phase 44C — Sector rotation scoring.
import type { SectorRow, SectorSection } from "./types";

export interface SectorInput {
  readonly key: string;
  readonly label?: string;
  readonly changePct: number | null;
}

const LABELS: Record<string, string> = {
  BANK: "Banking",
  IT: "IT",
  OIL_GAS: "Oil & Gas",
  AUTO: "Auto",
  FMCG: "FMCG",
  FIN: "Financials",
  PHARMA: "Pharma",
  REALTY: "Realty",
  METAL: "Metals",
};

export function rankSectors(inputs: readonly SectorInput[]): SectorSection {
  const rows: SectorRow[] = inputs.map((r) => ({
    key: r.key,
    label: r.label ?? LABELS[r.key] ?? r.key,
    changePct: r.changePct,
  }));
  const valid = rows.filter((r) => r.changePct != null && Number.isFinite(r.changePct));
  const sorted = [...valid].sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const strongest = sorted.slice(0, 3);
  const weakest = sorted.slice(-3).reverse();
  const mean = valid.length
    ? valid.reduce((s, r) => s + (r.changePct as number), 0) / valid.length
    : 0;
  const rotation = Math.max(-100, Math.min(100, mean * 20));
  return { rows, strongest, weakest, rotationScore: rotation };
}