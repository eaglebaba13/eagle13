// Phase 44C — FII/DII aggregation + institutional bias classifier.
import type { FiiDiiRow, FiiDiiSection, InstitutionalBias } from "./types";

export function classifyInstitutionalBias(
  fiiNet: number | null,
  diiNet: number | null,
): InstitutionalBias {
  if (fiiNet == null && diiNet == null) return "NEUTRAL";
  const combined = (fiiNet ?? 0) + (diiNet ?? 0);
  if (combined >= 5000) return "STRONG_BUY";
  if (combined >= 1500) return "BUY";
  if (combined <= -5000) return "STRONG_SELL";
  if (combined <= -1500) return "SELL";
  return "NEUTRAL";
}

export function aggregateFiiDii(rows: readonly FiiDiiRow[]): FiiDiiSection {
  if (rows.length === 0) {
    return {
      latest: null,
      previous: null,
      dailyChange: null,
      trend: [],
      institutionalBias: "NEUTRAL",
    };
  }
  const sorted = [...rows].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const latestCombined = latest.fiiNet + latest.diiNet;
  const prevCombined = previous ? previous.fiiNet + previous.diiNet : null;
  const dailyChange = prevCombined == null ? null : latestCombined - prevCombined;
  return {
    latest,
    previous,
    dailyChange,
    trend: sorted.slice(-30),
    institutionalBias: classifyInstitutionalBias(latest.fiiNet, latest.diiNet),
  };
}