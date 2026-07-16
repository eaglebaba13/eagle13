// Phase 27 · Stage 1 — EMA engine for Combined PCR series.
//
// Fast = 3, Slow = 8. Slope = fast - slow. Slope change = current -
// previous. Pure. No timers, no state — feed the historical series
// once per reading.

export const EMA_FAST = 3;
export const EMA_SLOW = 8;

export interface EmaSeries {
  readonly fast: readonly (number | null)[];
  readonly slow: readonly (number | null)[];
  readonly slope: readonly (number | null)[];
}

function alpha(period: number): number {
  return 2 / (period + 1);
}

export function computeEma(values: readonly (number | null)[], period: number): readonly (number | null)[] {
  const a = alpha(period);
  const out: (number | null)[] = new Array(values.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) { out[i] = prev; continue; }
    if (prev == null) { prev = v; out[i] = v; continue; }
    prev = a * v + (1 - a) * prev;
    out[i] = prev;
  }
  return out;
}

export function computeEmaSeries(scores: readonly (number | null)[]): EmaSeries {
  const fast = computeEma(scores, EMA_FAST);
  const slow = computeEma(scores, EMA_SLOW);
  const slope = fast.map((f, i) => (f == null || slow[i] == null ? null : (f as number) - (slow[i] as number)));
  return { fast, slow, slope };
}

export interface EmaTip {
  readonly fast: number | null;
  readonly slow: number | null;
  readonly slope: number | null;
  readonly previousSlope: number | null;
  readonly slopeChange: number | null;
  readonly zeroCross: boolean;
}

export function tip(series: EmaSeries): EmaTip {
  const n = series.slope.length;
  const cur = n > 0 ? series.slope[n - 1] : null;
  const prev = n > 1 ? series.slope[n - 2] : null;
  const slopeChange = cur == null || prev == null ? null : cur - prev;
  const zeroCross =
    cur != null && prev != null && ((prev <= 0 && cur > 0) || (prev >= 0 && cur < 0));
  return {
    fast: n > 0 ? series.fast[n - 1] : null,
    slow: n > 0 ? series.slow[n - 1] : null,
    slope: cur,
    previousSlope: prev,
    slopeChange,
    zeroCross,
  };
}