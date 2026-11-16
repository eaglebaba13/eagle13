import type { LtpCalculatorOutput, StockFourLineLevels } from "../options/ltp-calculator-engine.server";

export interface LtpChartLevel {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly color: string;
  readonly dash?: boolean;
}

export function calculatorUnderlying(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  return normalized === "NIFTY50" || normalized === "NIFTY 50" ? "NIFTY" : normalized;
}

/** Presentation only: prices and scenario rules come directly from the calculator RPCs. */
export function buildLtpChartLevels(data: LtpCalculatorOutput | null, fourLine?: StockFourLineLevels | null): LtpChartLevel[] {
  if (fourLine) return [
    { id: "p2", name: "P2 Strong Resistance", price: fourLine.p2, color: "#EF4444", dash: true },
    { id: "p1", name: "P1 Sell Trigger", price: fourLine.p1, color: "#F87171" },
    { id: "c1", name: "C1 Buy Trigger", price: fourLine.c1, color: "#34D399" },
    { id: "c2", name: "C2 Deep Support", price: fourLine.c2, color: "#10B981", dash: true },
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
  ].filter((level) => Number.isFinite(level.price) && level.price > 0);
}
