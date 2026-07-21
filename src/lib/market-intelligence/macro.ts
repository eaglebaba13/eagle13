// Phase 44C — Macro dashboard + risk classifier.
import type { MacroRisk, MacroRow, MacroSection } from "./types";

export interface MacroInput {
  readonly key: string;
  readonly label?: string;
  readonly last: number | null;
  readonly changePct: number | null;
}

const LABELS: Record<string, string> = {
  USDINR: "USD/INR",
  DXY: "US Dollar Index",
  US10Y: "US 10Y Yield",
  CRUDE: "Crude Oil",
  NATGAS: "Natural Gas",
  GOLD: "Gold",
  SILVER: "Silver",
};

export function classifyMacroRisk(inputs: readonly MacroInput[]): {
  risk: MacroRisk;
  reasons: string[];
} {
  const by = new Map(inputs.map((r) => [r.key, r] as const));
  let score = 0;
  const reasons: string[] = [];
  const dxy = by.get("DXY")?.changePct;
  if (dxy != null) {
    if (dxy > 0.75) { score += 2; reasons.push("DXY surging"); }
    else if (dxy > 0.3) { score += 1; reasons.push("DXY firm"); }
    else if (dxy < -0.5) { score -= 1; reasons.push("DXY softening"); }
  }
  const us10y = by.get("US10Y")?.changePct;
  if (us10y != null) {
    if (us10y > 3) { score += 2; reasons.push("US10Y spike"); }
    else if (us10y > 1) { score += 1; reasons.push("US10Y rising"); }
  }
  const crude = by.get("CRUDE")?.changePct;
  if (crude != null) {
    if (crude > 3) { score += 2; reasons.push("Crude spike"); }
    else if (crude > 1.5) { score += 1; reasons.push("Crude firm"); }
  }
  const usdinr = by.get("USDINR")?.changePct;
  if (usdinr != null && usdinr > 0.3) { score += 1; reasons.push("INR weakening"); }
  const risk: MacroRisk = score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";
  return { risk, reasons };
}

export function aggregateMacro(inputs: readonly MacroInput[]): MacroSection {
  const rows: MacroRow[] = inputs.map((r) => ({
    key: r.key,
    label: r.label ?? LABELS[r.key] ?? r.key,
    last: r.last,
    changePct: r.changePct,
  }));
  const { risk, reasons } = classifyMacroRisk(inputs);
  return { rows, macroRisk: risk, reasons };
}