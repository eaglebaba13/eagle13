// Phase 27 · Stage 3 — Conflict detection between breadth, PCR, VIX.

import type {
  ConflictItem,
  MarketBreadthSnapshot,
  PcrConfirmation,
  VixRegimeReading,
} from "./types";

export type BreadthDirectionLabel = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";

export function directionOfBreadth(b: MarketBreadthSnapshot | null): BreadthDirectionLabel {
  if (!b) return "UNKNOWN";
  if (b.dataQuality === "FAILED") return "UNKNOWN";
  const preferred = b.weightedBreadth ?? (b.netBreadth ?? 0);
  if (Math.abs(preferred) < 1e-6) return "NEUTRAL";
  return preferred > 0 ? "BULLISH" : "BEARISH";
}

export function directionOfPcr(p: PcrConfirmation): BreadthDirectionLabel {
  if (!p.available) return "UNKNOWN";
  const s = p.confirmedState;
  if (s === "STRONG_CE_FOCUS" || s === "CE_FOCUS") return "BULLISH";
  if (s === "STRONG_PE_FOCUS" || s === "PE_FOCUS") return "BEARISH";
  if (s === "BULLISH_WEAKENING") return "BEARISH";
  if (s === "BEARISH_WEAKENING") return "BULLISH";
  return "NEUTRAL";
}

export interface ConflictInputs {
  readonly broad: MarketBreadthSnapshot | null;
  readonly nifty50: MarketBreadthSnapshot | null;
  readonly topWeighted: MarketBreadthSnapshot | null;
  readonly banking: MarketBreadthSnapshot | null;
  readonly it: MarketBreadthSnapshot | null;
  readonly oilGas: MarketBreadthSnapshot | null;
  readonly auto: MarketBreadthSnapshot | null;
  readonly pcr: PcrConfirmation;
  readonly vix: VixRegimeReading;
}

export function detectConflicts(inp: ConflictInputs): readonly ConflictItem[] {
  const conflicts: ConflictItem[] = [];
  const broad = directionOfBreadth(inp.broad);
  const top = directionOfBreadth(inp.topWeighted);
  const nifty = directionOfBreadth(inp.nifty50);
  const bank = directionOfBreadth(inp.banking);
  const pcr = directionOfPcr(inp.pcr);
  const sectorMajorityBearish =
    [inp.banking, inp.it, inp.oilGas, inp.auto].filter(
      (s) => directionOfBreadth(s) === "BEARISH",
    ).length >= 3;
  const sectorMajorityBullish =
    [inp.banking, inp.it, inp.oilGas, inp.auto].filter(
      (s) => directionOfBreadth(s) === "BULLISH",
    ).length >= 3;

  if (broad === "BULLISH" && top === "BEARISH") {
    conflicts.push({ code: "BROAD_VS_WEIGHTED", message: "Broad breadth bullish but weighted breadth bearish" });
  }
  if (broad === "BEARISH" && top === "BULLISH") {
    conflicts.push({ code: "BROAD_VS_WEIGHTED_REV", message: "Broad breadth bearish but weighted breadth bullish" });
  }
  if (nifty === "BULLISH" && bank === "BEARISH") {
    conflicts.push({ code: "NIFTY_VS_BANKING", message: "NIFTY breadth bullish but Banking sector bearish" });
  }
  if (pcr === "BULLISH" && sectorMajorityBearish) {
    conflicts.push({ code: "PCR_VS_SECTORS", message: "PCR bullish but majority of sectors bearish" });
  }
  if (pcr === "BEARISH" && directionOfBreadth(inp.topWeighted) === "BULLISH") {
    conflicts.push({ code: "PCR_VS_TOP_WEIGHTED", message: "PCR bearish but weighted top stocks bullish" });
  }
  if (inp.vix.rising && (broad === "BEARISH" || sectorMajorityBearish)) {
    conflicts.push({ code: "VIX_RISING_BREADTH_WEAK", message: "India VIX rising while breadth weakens" });
  }
  // Freshness mismatch
  const breadthStale =
    inp.broad?.freshness === "STALE" || inp.nifty50?.freshness === "STALE" || inp.topWeighted?.freshness === "STALE";
  const pcrStale = inp.pcr.freshness === "STALE";
  if (breadthStale && !pcrStale && inp.pcr.available) {
    conflicts.push({ code: "STALE_BREADTH_FRESH_PCR", message: "Breadth is stale but PCR is fresh" });
  }
  if (!breadthStale && pcrStale) {
    conflicts.push({ code: "FRESH_BREADTH_STALE_PCR", message: "Breadth is fresh but PCR is stale" });
  }
  // silence "sectorMajorityBullish" unused if not consumed elsewhere
  void sectorMajorityBullish;
  return conflicts;
}
