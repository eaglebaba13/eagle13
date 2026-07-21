// Phase 44B — Daily level bundle (pivot + gann + astro) per instrument.
//
// Reuses the existing pivot/Gann implementation in `src/lib/levels.ts`
// (single source of truth — no second formula). Gann and Astro coverage
// are gated per asset class: only NSE indices have a validated
// implementation, so metals and crypto are explicitly UNAVAILABLE.

import { computeLevels } from "@/lib/levels";
import type { BriefInstrument } from "./instruments";
import type { SelectedCandle } from "./daily-candle";

export type LevelStatus = "FRESH" | "STALE" | "UNAVAILABLE";

export interface PivotLevels {
  readonly r3: number;
  readonly r2: number;
  readonly r1: number;
  readonly pp: number;
  readonly s1: number;
  readonly s2: number;
  readonly s3: number;
}

export interface GannLevels {
  readonly up: number | null;
  readonly down: number | null;
  readonly sourcePrice: number | null;
  readonly formulaVersion: string;
  readonly status: LevelStatus;
  readonly reason?: string;
}

export interface AstroLevelEntry {
  readonly name: string;
  readonly value: number;
  readonly direction: "UP" | "DOWN" | "PIVOT";
  readonly role: string;
  readonly source: string;
}

export interface AstroCoverage {
  readonly status: LevelStatus;
  readonly levels: readonly AstroLevelEntry[];
  readonly generatedAt: string;
  readonly validForDate: string;
  readonly reason?: string;
}

export interface LevelBundle {
  readonly instrumentId: BriefInstrument["id"];
  readonly tradingDate: string;
  readonly sourceCandle: SelectedCandle;
  readonly pivot: PivotLevels;
  readonly pivotFormulaVersion: string;
  readonly gann: GannLevels;
  readonly astro: AstroCoverage;
  readonly calculatedAt: string;
  readonly freshness: LevelStatus;
}

export const PIVOT_FORMULA_VERSION = "EAGLEBABA_PIVOT_V1";
export const GANN_ABSOLUTE_FORMULA = "GANN_SQUARE_OF_9_V1";

function isIndex(id: BriefInstrument["id"]): boolean {
  return id === "NIFTY" || id === "BANKNIFTY";
}

export function buildLevelBundle(
  instrument: BriefInstrument,
  candle: SelectedCandle,
  now: number = Date.now(),
): LevelBundle {
  const lv = computeLevels(
    { open: candle.open, high: candle.high, low: candle.low, close: candle.close },
    0,
  );
  const pivot: PivotLevels = {
    r3: lv.r3, r2: lv.r2, r1: lv.r1, pp: lv.pivot,
    s1: lv.s1, s2: lv.s2, s3: lv.s3,
  };

  const gann: GannLevels = isIndex(instrument.id)
    ? {
        up: lv.gannUp, down: lv.gannDown, sourcePrice: candle.close,
        formulaVersion: GANN_ABSOLUTE_FORMULA, status: candle.freshness,
      }
    : {
        up: null, down: null, sourcePrice: null,
        formulaVersion: GANN_ABSOLUTE_FORMULA, status: "UNAVAILABLE",
        reason: "Gann formula validated only for NSE indices in this release.",
      };

  const astro: AstroCoverage = isIndex(instrument.id)
    ? {
        status: candle.freshness,
        levels: [],
        generatedAt: new Date(now).toISOString(),
        validForDate: candle.candleOpenTime.slice(0, 10),
      }
    : {
        status: "UNAVAILABLE",
        levels: [],
        generatedAt: new Date(now).toISOString(),
        validForDate: candle.candleOpenTime.slice(0, 10),
        reason: "Astro engine validated only for NSE indices in this release.",
      };

  return {
    instrumentId: instrument.id,
    tradingDate: candle.candleOpenTime.slice(0, 10),
    sourceCandle: candle,
    pivot,
    pivotFormulaVersion: PIVOT_FORMULA_VERSION,
    gann,
    astro,
    calculatedAt: new Date(now).toISOString(),
    freshness: candle.freshness,
  };
}