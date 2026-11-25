/**
 * Pure workspace helpers for Live Chart:
 * - Continuous session-to-session candle normalization
 * - Flexible Bar Replay start-point resolution (session start, HH:MM IST, timestamp, index)
 * - Per-symbol + timeframe drawing persistence & lock state helpers
 */

import type { ChartDrawing } from "./drawing-types";
import type { MergedCandlePoint } from "../provider-foundation/indstocks/candle-aggregator";

export type ReplayStartTarget =
  | { readonly mode: "session_start" }
  | { readonly mode: "last_quarter" }
  | { readonly mode: "index"; readonly index: number }
  | { readonly mode: "timestamp"; readonly timeMs: number }
  | { readonly mode: "time_string"; readonly hhmm: string };

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Formats a epoch-ms timestamp in IST (`DD MMM HH:MM IST`) for Replay & Context Menu HUDs.
 */
export function formatIstTimestamp(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return "--";
  const normalizedMs = timeMs > 1e11 ? timeMs : timeMs * 1000;
  try {
    return (
      new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(normalizedMs)) + " IST"
    );
  } catch {
    return "--";
  }
}

/**
 * Returns the YYYY-MM-DD calendar date string in IST for a given epoch-ms timestamp.
 */
export function getIstDateKey(timeMs: number): string {
  const normalizedMs = timeMs > 1e11 ? timeMs : timeMs * 1000;
  const shifted = new Date(normalizedMs + IST_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Ensures historical + live candles are strictly ascending, deduplicated,
 * and have valid OHLC bounds so Lightweight Charts renders continuously across sessions.
 */
export function ensureContinuousCandles(
  candles: readonly MergedCandlePoint[],
): MergedCandlePoint[] {
  if (candles.length === 0) return [];
  const byTime = new Map<number, MergedCandlePoint>();
  for (const c of candles) {
    if (!Number.isFinite(c.x) || c.x <= 0) continue;
    const [open, rawHigh, rawLow, close] = c.y;
    if (
      !Number.isFinite(open) ||
      !Number.isFinite(rawHigh) ||
      !Number.isFinite(rawLow) ||
      !Number.isFinite(close) ||
      open <= 0 ||
      close <= 0
    ) {
      continue;
    }
    const high = Math.max(rawHigh, open, close);
    const low = Math.min(rawLow, open, close);
    if (low <= 0) continue;
    const existing = byTime.get(c.x);
    if (!existing) {
      byTime.set(c.x, { x: c.x, y: [open, high, low, close], volume: c.volume });
    } else {
      byTime.set(c.x, {
        x: c.x,
        y: [
          existing.y[0],
          Math.max(existing.y[1], high),
          Math.min(existing.y[2], low),
          close,
        ],
        volume:
          existing.volume == null
            ? c.volume
            : c.volume == null
              ? existing.volume
              : Math.max(existing.volume, c.volume),
      });
    }
  }
  return [...byTime.values()].sort((a, b) => a.x - b.x);
}

/**
 * Resolves a flexible Replay start index within `candles` (clamped to `[1, candles.length - 1]`).
 * Returns `null` when fewer than 2 candles are available.
 */
export function resolveReplayStartIndex(
  candles: readonly { readonly x: number }[],
  target: ReplayStartTarget,
): number | null {
  if (candles.length < 2) return null;
  const maxIdx = candles.length - 1;
  const clamp = (idx: number) => Math.max(1, Math.min(maxIdx, Math.round(idx)));

  switch (target.mode) {
    case "last_quarter":
      return clamp(Math.floor(candles.length * 0.75));

    case "index":
      return clamp(target.index);

    case "timestamp": {
      const targetMs = target.timeMs > 1e11 ? target.timeMs : target.timeMs * 1000;
      const found = candles.findIndex((c) => {
        const ms = c.x > 1e11 ? c.x : c.x * 1000;
        return ms >= targetMs;
      });
      return found >= 0 ? clamp(found) : maxIdx;
    }

    case "session_start": {
      const latestMs = candles[maxIdx].x;
      const latestDate = getIstDateKey(latestMs);
      const firstToday = candles.findIndex((c) => getIstDateKey(c.x) === latestDate);
      return firstToday >= 0 ? clamp(firstToday) : 1;
    }

    case "time_string": {
      const match = /^(\d{1,2}):(\d{2})$/.exec(target.hhmm.trim());
      if (!match) return null;
      const targetHour = Number(match[1]);
      const targetMin = Number(match[2]);
      if (targetHour < 0 || targetHour > 23 || targetMin < 0 || targetMin > 59) {
        return null;
      }
      const targetMinutes = targetHour * 60 + targetMin;
      const latestDate = getIstDateKey(candles[maxIdx].x);

      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < candles.length; i++) {
        if (getIstDateKey(candles[i].x) !== latestDate) continue;
        const ms = candles[i].x > 1e11 ? candles[i].x : candles[i].x * 1000;
        const ist = new Date(ms + IST_OFFSET_MS);
        const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
        const diff = Math.abs(mins - targetMinutes);
        if (mins >= targetMinutes && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) return clamp(bestIdx);
      // Fallback: closest bar in latest session before targetMinutes
      for (let i = candles.length - 1; i >= 0; i--) {
        if (getIstDateKey(candles[i].x) === latestDate) return clamp(i);
      }
      return clamp(Math.floor(candles.length * 0.5));
    }
  }
}

const DRAWINGS_KEY_PREFIX = "eaglebaba_chart_drawings_";

export function getDrawingStorageKey(symbol: string, intervalMs?: number): string {
  const sym = symbol.trim().toUpperCase();
  return intervalMs != null && intervalMs > 0
    ? `${DRAWINGS_KEY_PREFIX}${sym}_${intervalMs}`
    : `${DRAWINGS_KEY_PREFIX}${sym}`;
}

export function loadWorkspaceDrawings(symbol: string, intervalMs: number): ChartDrawing[] {
  if (typeof window === "undefined") return [];
  try {
    const scopedRaw = localStorage.getItem(getDrawingStorageKey(symbol, intervalMs));
    if (scopedRaw) {
      const parsed = JSON.parse(scopedRaw);
      if (Array.isArray(parsed)) return parsed;
    }
    // Fallback to legacy symbol-only key so existing drawings remain visible
    const legacyRaw = localStorage.getItem(getDrawingStorageKey(symbol));
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

export function persistWorkspaceDrawings(
  symbol: string,
  intervalMs: number,
  drawings: readonly ChartDrawing[],
): void {
  if (typeof window === "undefined") return;
  try {
    const complete = drawings.filter((d) => d.isComplete);
    localStorage.setItem(getDrawingStorageKey(symbol, intervalMs), JSON.stringify(complete));
  } catch {
    // ignore storage quota errors
  }
}

export function clearWorkspaceDrawings(symbol: string, intervalMs: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getDrawingStorageKey(symbol, intervalMs));
    localStorage.removeItem(getDrawingStorageKey(symbol));
  } catch {
    // ignore
  }
}
