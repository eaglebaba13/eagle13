// Phase 23 · Stage 2 — At-most-one active shadow position per key.
// Research-only. No broker sync, no balance mutation.

import type {
  ShadowClosedCandle,
  ShadowHypotheticalPosition,
  ShadowOutcome,
  ShadowStatus,
} from "./shadow-types";

export type ActiveShadowKey = {
  readonly instrument: string;
  readonly timeframe: string;
  readonly strategy: string;
  readonly formulaVersion: string;
};

export type ActiveShadowPosition = {
  readonly key: ActiveShadowKey;
  readonly sessionId: string;
  readonly observationId: string;
  readonly position: ShadowHypotheticalPosition;
  readonly maxHoldBars: number;
  readonly barsElapsed: number;
  readonly mfe: number;
  readonly mae: number;
  readonly status: ShadowStatus;
  readonly evidenceIds: { recommendationRunId: string | null; portfolioRunId: string | null };
};

function keyStr(k: ActiveShadowKey): string {
  return `${k.instrument}|${k.timeframe}|${k.strategy}|${k.formulaVersion}`;
}

export class ActiveShadowStore {
  private map = new Map<string, ActiveShadowPosition>();

  has(k: ActiveShadowKey): boolean {
    return this.map.has(keyStr(k));
  }
  get(k: ActiveShadowKey): ActiveShadowPosition | undefined {
    return this.map.get(keyStr(k));
  }
  set(pos: ActiveShadowPosition): void {
    this.map.set(keyStr(pos.key), pos);
  }
  delete(k: ActiveShadowKey): void {
    this.map.delete(keyStr(k));
  }
  values(): readonly ActiveShadowPosition[] {
    return Array.from(this.map.values());
  }
  clear(): void {
    this.map.clear();
  }

  // Deterministic bar-by-bar advance.
  advance(
    k: ActiveShadowKey,
    candle: ShadowClosedCandle,
  ): { position: ActiveShadowPosition; outcome: ShadowOutcome | null } | null {
    const cur = this.map.get(keyStr(k));
    if (!cur) return null;
    const p = cur.position;
    let mfe = cur.mfe;
    let mae = cur.mae;
    if (p.side === "LONG") {
      mfe = Math.max(mfe, candle.high - p.entry);
      mae = Math.min(mae, candle.low - p.entry);
    } else {
      mfe = Math.max(mfe, p.entry - candle.low);
      mae = Math.min(mae, p.entry - candle.high);
    }
    const next: ActiveShadowPosition = {
      ...cur,
      barsElapsed: cur.barsElapsed + 1,
      mfe,
      mae,
    };
    this.map.set(keyStr(k), next);
    return { position: next, outcome: null };
  }
}