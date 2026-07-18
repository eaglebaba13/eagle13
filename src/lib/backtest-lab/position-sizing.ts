// Phase 3G — Deterministic position-sizing calculator.
// Rejects invalid inputs. Kelly disabled unless explicitly enabled +
// capped; never surfaced as recommended live sizing.

import type { PositionSizing } from "./types";

export class PositionSizingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PositionSizingError";
  }
}

export interface SizingContext {
  readonly capital: number;
  readonly price: number;
  readonly stopDistance: number;
  readonly winRate?: number;
  readonly payoff?: number;
  readonly atr?: number | null;
}

export function computeQuantity(
  sizing: PositionSizing,
  ctx: SizingContext,
): number {
  if (!Number.isFinite(ctx.capital) || ctx.capital <= 0) {
    throw new PositionSizingError("BAD_CAPITAL", "capital must be > 0");
  }
  if (!Number.isFinite(ctx.price) || ctx.price <= 0) {
    throw new PositionSizingError("BAD_PRICE", "price must be > 0");
  }
  const multiplier = sizing.contractMultiplier ?? 1;
  const lot = Math.max(1, sizing.lotSize ?? 1);
  const minQty = Math.max(1, sizing.minQty ?? 1);

  let raw: number;
  switch (sizing.method) {
    case "FIXED_QTY":
      if (!Number.isFinite(sizing.fixedQty) || (sizing.fixedQty ?? 0) <= 0) {
        throw new PositionSizingError("BAD_FIXED_QTY", "fixedQty must be > 0");
      }
      raw = sizing.fixedQty as number;
      break;
    case "FIXED_CAPITAL": {
      const cap = sizing.fixedCapital ?? 0;
      if (!(cap > 0)) throw new PositionSizingError("BAD_FIXED_CAPITAL", "fixedCapital > 0");
      raw = cap / (ctx.price * multiplier);
      break;
    }
    case "FIXED_RISK": {
      const risk = sizing.riskPerTrade ?? 0;
      if (!(risk > 0)) throw new PositionSizingError("BAD_RISK", "riskPerTrade > 0");
      if (!(ctx.stopDistance > 0)) throw new PositionSizingError("BAD_STOP", "stopDistance > 0");
      raw = risk / (ctx.stopDistance * multiplier);
      break;
    }
    case "PCT_CAPITAL": {
      const p = sizing.pctCapital ?? 0;
      if (!(p > 0 && p <= 1)) throw new PositionSizingError("BAD_PCT", "pctCapital in (0,1]");
      raw = (ctx.capital * p) / (ctx.price * multiplier);
      break;
    }
    case "VOL_ADJUSTED": {
      const p = sizing.pctCapital ?? 0.01;
      const vol = ctx.atr ?? ctx.stopDistance;
      if (!(vol > 0)) throw new PositionSizingError("BAD_VOL", "volatility unavailable");
      raw = (ctx.capital * p) / (vol * multiplier);
      break;
    }
    case "ATR_RISK": {
      const risk = sizing.riskPerTrade ?? ctx.capital * 0.01;
      if (!(ctx.atr && ctx.atr > 0)) throw new PositionSizingError("BAD_ATR", "ATR required");
      raw = risk / ((ctx.atr as number) * multiplier);
      break;
    }
    case "FRACTIONAL_KELLY": {
      const f = sizing.kellyFraction ?? 0;
      const capped = Math.min(Math.max(f, 0), 0.5);
      const wr = ctx.winRate ?? 0;
      const payoff = ctx.payoff ?? 0;
      if (!(wr > 0 && wr < 1) || !(payoff > 0)) {
        throw new PositionSizingError("KELLY_INPUTS", "winRate/payoff required for Kelly");
      }
      const edge = wr - (1 - wr) / payoff;
      const kellyPct = Math.max(0, edge) * capped;
      raw = (ctx.capital * kellyPct) / (ctx.price * multiplier);
      break;
    }
  }
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new PositionSizingError("NON_FINITE", "quantity not finite");
  }
  const rounded = Math.floor(raw / lot) * lot;
  if (rounded < minQty) {
    throw new PositionSizingError("BELOW_MIN_QTY", "computed quantity below provider minimum");
  }
  return rounded;
}