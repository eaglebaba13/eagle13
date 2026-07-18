// Phase 3G — Deterministic cost + slippage models. Placeholders never
// masquerade as live brokerage rates.

import type { CostModel, SlippageModel } from "./types";

export const DEFAULT_COST_MODEL: CostModel = {
  kind: "ZERO",
  version: "COST_MODEL_V1_ZERO",
  placeholder: true,
};

export const DEFAULT_SLIPPAGE_MODEL: SlippageModel = {
  kind: "ZERO",
  version: "SLIP_MODEL_V1_ZERO",
  placeholder: true,
};

export function computeFee(
  model: CostModel,
  price: number,
  quantity: number,
  side: "BUY" | "SELL",
): number {
  const notional = price * quantity;
  switch (model.kind) {
    case "ZERO":
      return 0;
    case "FIXED_PER_TRADE":
      return Math.max(0, model.perTrade ?? 0);
    case "PCT":
      return notional * Math.max(0, model.pct ?? 0);
    case "MAKER_TAKER": {
      const bps = (side === "BUY" ? model.takerBps : model.makerBps) ?? model.takerBps ?? 0;
      return notional * (bps / 10_000);
    }
    case "BROKERAGE_TAXES": {
      const flat = model.perTrade ?? 0;
      const pct = notional * (model.pct ?? 0);
      const taxes = notional * (model.taxesPct ?? 0);
      return Math.max(0, flat + pct + taxes);
    }
    case "CUSTOM":
      return notional * Math.max(0, model.pct ?? 0) + Math.max(0, model.perTrade ?? 0);
  }
}

export function applySlippage(
  model: SlippageModel,
  price: number,
  side: "BUY" | "SELL",
): number {
  const dir = side === "BUY" ? 1 : -1;
  switch (model.kind) {
    case "ZERO":
      return price;
    case "FIXED_POINTS":
      return price + dir * Math.max(0, model.points ?? 0);
    case "PCT":
      return price * (1 + dir * Math.max(0, model.pct ?? 0));
    case "BID_ASK":
      // Requires bid/ask; unavailable → return price unchanged.
      return price;
  }
}