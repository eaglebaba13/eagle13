// Phase 3G — Deterministic single-position trade simulator.
// Consumes canonical signal snapshots on each bar; NO look-ahead:
// entries execute on the next bar's open by default.

import type {
  HistoricalCandle,
  SimulatedTrade,
  StrategyDefinition,
  TradeExitReason,
} from "./types";
import { evaluateNode } from "./signal-composer";
import { computeQuantity } from "./position-sizing";
import { applySlippage, computeFee } from "./cost-model";

export interface SimulationOptions {
  readonly allowConcurrent?: boolean;
  readonly disableSizing?: boolean; // for pure signal replays
}

interface OpenPosition {
  direction: "LONG" | "SHORT";
  entryTs: string;
  entryPrice: number;
  quantity: number;
  stop: number | null;
  target: number | null;
  mfe: number;
  mae: number;
  entryReason: string;
  bars: number;
  fees: number;
  slippage: number;
  trailingLevel: number | null;
  warnings: string[];
}

function computeStopTarget(
  entryPrice: number,
  direction: "LONG" | "SHORT",
  def: StrategyDefinition,
  atr: number | null | undefined,
): { stop: number | null; target: number | null; stopDistance: number } {
  const x = def.exit;
  let stop: number | null = null;
  if (x.stopType === "FIXED" && Number.isFinite(x.stopValue)) {
    stop = direction === "LONG" ? entryPrice - (x.stopValue ?? 0) : entryPrice + (x.stopValue ?? 0);
  } else if (x.stopType === "PCT" && Number.isFinite(x.stopValue)) {
    const d = entryPrice * (x.stopValue ?? 0);
    stop = direction === "LONG" ? entryPrice - d : entryPrice + d;
  } else if (x.stopType === "ATR" && atr && Number.isFinite(atr)) {
    const d = atr * (x.stopValue ?? 1);
    stop = direction === "LONG" ? entryPrice - d : entryPrice + d;
  }
  let target: number | null = null;
  if (x.targetType === "FIXED" && Number.isFinite(x.targetValue)) {
    target = direction === "LONG" ? entryPrice + (x.targetValue ?? 0) : entryPrice - (x.targetValue ?? 0);
  } else if (x.targetType === "PCT" && Number.isFinite(x.targetValue)) {
    const d = entryPrice * (x.targetValue ?? 0);
    target = direction === "LONG" ? entryPrice + d : entryPrice - d;
  } else if (x.targetType === "RR" && stop != null && Number.isFinite(x.targetValue)) {
    const risk = Math.abs(entryPrice - stop);
    const d = risk * (x.targetValue ?? 0);
    target = direction === "LONG" ? entryPrice + d : entryPrice - d;
  }
  const stopDistance = stop != null ? Math.abs(entryPrice - stop) : 0;
  return { stop, target, stopDistance };
}

function closePosition(
  def: StrategyDefinition,
  pos: OpenPosition,
  exitTs: string,
  exitPriceRaw: number,
  reason: TradeExitReason,
  ambiguous: boolean,
  tradeSeq: number,
): SimulatedTrade {
  const side: "BUY" | "SELL" = pos.direction === "LONG" ? "SELL" : "BUY";
  const exitPrice = applySlippage(def.slippage, exitPriceRaw, side);
  const exitFee = computeFee(def.costs, exitPrice, pos.quantity, side);
  const grossPerUnit = pos.direction === "LONG"
    ? exitPrice - pos.entryPrice
    : pos.entryPrice - exitPrice;
  const grossPnl = grossPerUnit * pos.quantity;
  const totalFees = pos.fees + exitFee;
  const netPnl = grossPnl - totalFees;
  const returnPct = pos.entryPrice > 0
    ? (grossPerUnit / pos.entryPrice) * 100
    : 0;
  return {
    tradeId: `${def.strategyId}#${tradeSeq}`,
    strategyId: def.strategyId,
    symbol: def.universe[0] ?? "",
    direction: pos.direction,
    entryTs: pos.entryTs,
    exitTs,
    entryPrice: pos.entryPrice,
    exitPrice,
    quantity: pos.quantity,
    stop: pos.stop,
    target: pos.target,
    grossPnl,
    netPnl,
    returnPct,
    fees: totalFees,
    slippage: pos.slippage,
    mfe: pos.mfe,
    mae: pos.mae,
    holdingBars: pos.bars,
    entryReason: pos.entryReason,
    exitReason: reason,
    ambiguous,
    warnings: pos.warnings.slice(),
  };
}

export function simulate(
  def: StrategyDefinition,
  candles: readonly HistoricalCandle[],
  options: SimulationOptions = {},
): { trades: SimulatedTrade[]; droppedBars: number; warnings: string[] } {
  const trades: SimulatedTrade[] = [];
  const warnings: string[] = [];
  let droppedBars = 0;
  let pos: OpenPosition | null = null;
  let pendingSignal: null | { direction: "LONG" | "SHORT"; reason: string } = null;
  let seq = 1;

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    if (bar.valid === false) { droppedBars++; continue; }

    // 1. Update open position: check stop/target using the current bar.
    if (pos) {
      pos.bars++;
      pos.mfe = Math.max(pos.mfe,
        pos.direction === "LONG" ? bar.high - pos.entryPrice : pos.entryPrice - bar.low);
      pos.mae = Math.max(pos.mae,
        pos.direction === "LONG" ? pos.entryPrice - bar.low : bar.high - pos.entryPrice);

      const stopHit = pos.stop != null && (
        pos.direction === "LONG" ? bar.low <= pos.stop : bar.high >= pos.stop
      );
      const targetHit = pos.target != null && (
        pos.direction === "LONG" ? bar.high >= pos.target : bar.low <= pos.target
      );

      if (stopHit && targetHit) {
        // Same-bar ambiguity — apply configured policy.
        const policy = def.exit.sameBarPolicy;
        const usedPrice = policy === "TARGET_FIRST" ? (pos.target as number) : (pos.stop as number);
        const reason: TradeExitReason = policy === "TARGET_FIRST" ? "TARGET" : "STOP";
        pos.warnings.push("SAME_BAR_STOP_AND_TARGET");
        trades.push(closePosition(def, pos, bar.ts, usedPrice, policy === "AMBIGUOUS" ? "AMBIGUOUS_BAR" : reason, true, seq++));
        pos = null;
      } else if (stopHit) {
        const gapThrough = pos.direction === "LONG" ? bar.open < (pos.stop as number) : bar.open > (pos.stop as number);
        const fill = gapThrough ? bar.open : (pos.stop as number);
        if (gapThrough) pos.warnings.push("GAP_THROUGH_STOP");
        trades.push(closePosition(def, pos, bar.ts, fill, "STOP", false, seq++));
        pos = null;
      } else if (targetHit) {
        const gapThrough = pos.direction === "LONG" ? bar.open > (pos.target as number) : bar.open < (pos.target as number);
        const fill = gapThrough ? bar.open : (pos.target as number);
        if (gapThrough) pos.warnings.push("GAP_THROUGH_TARGET");
        trades.push(closePosition(def, pos, bar.ts, fill, "TARGET", false, seq++));
        pos = null;
      } else if (def.exit.maxHoldingBars && pos.bars >= def.exit.maxHoldingBars) {
        trades.push(closePosition(def, pos, bar.ts, bar.close, "MAX_HOLDING", false, seq++));
        pos = null;
      }
    }

    // 2. Execute pending signal on this bar's open.
    if (!pos && pendingSignal) {
      const side: "BUY" | "SELL" = pendingSignal.direction === "LONG" ? "BUY" : "SELL";
      const rawEntry = bar.open;
      const entryPrice = applySlippage(def.slippage, rawEntry, side);
      const { stop, target, stopDistance } = computeStopTarget(entryPrice, pendingSignal.direction, def, bar.atr ?? null);
      try {
        const qty = options.disableSizing
          ? 1
          : computeQuantity(def.sizing, {
              capital: def.capital,
              price: entryPrice,
              stopDistance: stopDistance > 0 ? stopDistance : entryPrice * 0.01,
              atr: bar.atr ?? null,
            });
        const entryFee = computeFee(def.costs, entryPrice, qty, side);
        pos = {
          direction: pendingSignal.direction,
          entryTs: bar.ts,
          entryPrice,
          quantity: qty,
          stop,
          target,
          mfe: 0,
          mae: 0,
          entryReason: pendingSignal.reason,
          bars: 0,
          fees: entryFee,
          slippage: Math.abs(entryPrice - rawEntry) * qty,
          trailingLevel: null,
          warnings: [],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "SIZING_ERROR";
        warnings.push(`SIZING:${msg}`);
      }
      pendingSignal = null;
    }

    // 3. Evaluate strategy conditions on current bar's snapshot;
    //    signal fires for the NEXT bar (no same-bar future data).
    if (!pos && !pendingSignal) {
      const r = evaluateNode(def.conditions, bar.signalSnapshot ?? null);
      if (r === "MATCH") {
        const dir: "LONG" | "SHORT" = def.direction === "SHORT" ? "SHORT" : "LONG";
        pendingSignal = { direction: dir, reason: "SIGNAL_MATCH" };
      }
    }
  }

  // Force-close any open position at end of data.
  if (pos) {
    const last = candles[candles.length - 1];
    trades.push(closePosition(def, pos, last.ts, last.close, "END_OF_DATA", false, seq++));
  }

  return { trades, droppedBars, warnings };
}