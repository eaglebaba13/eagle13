import type { LtpCalculatorOutput, StockFourLineLevels } from "../options/ltp-calculator-engine.server";

export interface LtpChartLevel {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly color: string;
  readonly dash?: boolean;
  readonly lineWidth?: 1 | 2;
  readonly detail?: string;
}

/** Plot the engine's flagged challenger reversal prices, including independent Volume/OI shifts. */
export function buildShiftingChartLevels(data: LtpCalculatorOutput | null): LtpChartLevel[] {
  if (!data) return [];
  const result: LtpChartLevel[] = [];
  for (const { strikes, side, role } of [
    { strikes: data.putStrikes, side: "PE", role: "Support" },
    { strikes: data.callStrikes, side: "CE", role: "Resistance" },
  ]) {
    for (const strike of strikes) {
      if (!Number.isFinite(strike.strike) || strike.strike <= 0 || !Number.isFinite(strike.reversalPrice) || strike.reversalPrice <= 0) continue;
      for (const direction of ["WTT", "WTB"] as const) {
        const volume = direction === "WTT" ? strike.isWttVol : strike.isWtbVol;
        const oi = direction === "WTT" ? strike.isWttOi : strike.isWtbOi;
        if (!volume && !oi) continue;
        const factor = (name: string, percent: number) => Number.isFinite(percent) ? `${name} ${percent.toFixed(1)}%` : name;
        const detail = [volume ? factor("VOL", strike.volPct) : null, oi ? factor("OI", strike.oiPct) : null].filter(Boolean).join(" / ");
        result.push({ id: `shift-${side.toLowerCase()}-${direction.toLowerCase()}-${strike.strike}`,
          name: `${direction} ${role} (${strike.strike} ${side})`, price: strike.reversalPrice,
          color: direction === "WTT" ? "#06B6D4" : "#F43F5E", dash: true, lineWidth: 2, detail });
      }
    }
  }
  return result;
}

export function calculatorUnderlying(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  return normalized === "NIFTY50" || normalized === "NIFTY 50" ? "NIFTY" : normalized;
}

/** Presentation only: prices and scenario rules come directly from the calculator RPCs. */
export function buildLtpChartLevels(data: LtpCalculatorOutput | null, fourLine?: Pick<StockFourLineLevels, "p2" | "p1" | "c1" | "c2"> | null): LtpChartLevel[] {
  const shifting = buildShiftingChartLevels(data);
  if (fourLine) return [
    { id: "p2", name: "P2 Strong Resistance", price: fourLine.p2, color: "#EF4444", dash: true },
    { id: "p1", name: "P1 Sell Trigger", price: fourLine.p1, color: "#F87171" },
    { id: "c1", name: "C1 Buy Trigger", price: fourLine.c1, color: "#34D399" },
    { id: "c2", name: "C2 Deep Support", price: fourLine.c2, color: "#10B981", dash: true },
    ...shifting,
  ].filter((level) => Number.isFinite(level.price) && level.price > 0);
  if (!data) return [];
  const levels = data.reversalLevels;
  return [
    { id: "eos", name: `EOS Support (${levels.supportStrike} PE)`, price: levels.eos, color: "#34D399" },
    ...(levels.sModerate !== levels.eos ? [{ id: "s-mod", name: "S-MOD Safe Buy", price: levels.sModerate, color: "#10B981", dash: true }] : []),
    { id: "eor", name: `EOR Resistance (${levels.resistanceStrike} CE)`, price: levels.eor, color: "#F87171" },
    ...(levels.rModerate !== levels.eor ? [{ id: "r-mod", name: "R-MOD Safe Sell", price: levels.rModerate, color: "#F43F5E", dash: true }] : []),
    { id: "max-pain", name: "Max Pain SL / EOS-1", price: levels.maxPainSl, color: "#F59E0B", dash: true },
    { id: "max-gain", name: "Max Gain TP", price: levels.maxGainTarget, color: "#38BDF8", dash: true },
    ...shifting,
  ].filter((level) => Number.isFinite(level.price) && level.price > 0);
}
