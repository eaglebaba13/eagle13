// Phase 22 · Stage 1 — Kelly sizing. Transparent formula, hard caps,
// insufficient-sample and unstable-expectancy blocks. Research-only.

export type KellyInput = {
  readonly winProbability: number; // 0..1
  readonly averageWin: number; // positive PnL magnitude
  readonly averageLoss: number; // positive PnL magnitude (loss size)
  readonly tradeCount: number;
  readonly fraction: "FULL" | "HALF" | "QUARTER" | "CUSTOM";
  readonly custom?: number;
  readonly maxAllocation?: number; // hard cap 0..1
  readonly minTrades?: number; // insufficient sample block
};

export type KellyResult = {
  readonly fraction: number; // final capped fraction (0..1)
  readonly raw: number;
  readonly formula: string;
  readonly blocked: boolean;
  readonly reason: string | null;
};

function fractionMultiplier(f: KellyInput["fraction"], custom?: number): number {
  switch (f) {
    case "FULL":
      return 1;
    case "HALF":
      return 0.5;
    case "QUARTER":
      return 0.25;
    case "CUSTOM":
      return Math.max(0, Math.min(1, custom ?? 0));
  }
}

export function computeKelly(input: KellyInput): KellyResult {
  const minTrades = input.minTrades ?? 30;
  const cap = Math.max(0, Math.min(1, input.maxAllocation ?? 0.4));
  const formula = "k = (p*b - q) / b, where b = avgWin/avgLoss, q = 1 - p";

  if (input.tradeCount < minTrades) {
    return { fraction: 0, raw: 0, formula, blocked: true, reason: `INSUFFICIENT_SAMPLE (${input.tradeCount}<${minTrades})` };
  }
  if (input.averageLoss <= 0 || input.averageWin <= 0) {
    return { fraction: 0, raw: 0, formula, blocked: true, reason: "UNSTABLE_EXPECTANCY" };
  }
  const p = Math.max(0, Math.min(1, input.winProbability));
  const q = 1 - p;
  const b = input.averageWin / input.averageLoss;
  const raw = (p * b - q) / b;
  if (!Number.isFinite(raw) || raw <= 0) {
    return { fraction: 0, raw: 0, formula, blocked: true, reason: "NEGATIVE_EDGE" };
  }
  const scaled = raw * fractionMultiplier(input.fraction, input.custom);
  const final = Math.max(0, Math.min(cap, scaled));
  return { fraction: final, raw, formula, blocked: false, reason: null };
}