// Phase 21.2 · Stage 4 — server function stitching the snapshot + candle
// fetch + deterministic simulator together. VALIDATION ONLY: no broker
// actions, no live alerts, no Decision Engine wiring.

import { createServerFn } from "@tanstack/react-start";
import { getGannIntradaySnapshot, type IntradaySnapshot } from "./gann-intraday.functions";
import { getIntraday5mCandles, type CandleFetchResult } from "./gann-intraday-candles.functions";
import {
  simulateSession,
  type SessionSimulation,
  type AmbiguousPolicy,
} from "./gann-intraday-simulator";
import type { CubeInputs } from "./gann-cube-engine";
import type { InstrumentSymbol } from "./gann-intraday-anchor";

type StarBias = CubeInputs["starBias"];
type BinaryBias = CubeInputs["retrograde"];

export type ValidationArgs = {
  instrument: InstrumentSymbol;
  tradingDate?: string;
  ambiguousPolicy?: AmbiguousPolicy;
  starBias?: StarBias;
  retrograde?: BinaryBias;
  aspect?: BinaryBias;
  priceAction?: BinaryBias;
  ema13?: BinaryBias;
  rsi14?: BinaryBias;
};

export type ValidationResult = {
  snapshot: IntradaySnapshot;
  candles: CandleFetchResult;
  simulation: SessionSimulation;
  ambiguousPolicy: AmbiguousPolicy;
  cubeInputs: {
    starBias: StarBias;
    retrograde: BinaryBias;
    aspect: BinaryBias;
    priceAction: BinaryBias;
    ema13: BinaryBias;
    rsi14: BinaryBias;
  };
  generatedAt: string;
};

export const runIntradayValidation = createServerFn({ method: "POST" })
  .inputValidator((input: ValidationArgs) => {
    if (input?.instrument !== "NIFTY50" && input?.instrument !== "BANKNIFTY") {
      throw new Error("instrument must be NIFTY50 or BANKNIFTY");
    }
    return input;
  })
  .handler(async ({ data }): Promise<ValidationResult> => {
    const snapshot = await getGannIntradaySnapshot({
      data: { instrument: data.instrument, tradingDate: data.tradingDate },
    });
    const candles = await getIntraday5mCandles({
      data: { instrument: data.instrument, sessionDate: snapshot.tradingDate },
    });
    const cubeInputs = {
      starBias: (data.starBias ?? "UNKNOWN") as StarBias,
      retrograde: (data.retrograde ?? "UNKNOWN") as BinaryBias,
      aspect: (data.aspect ?? "UNKNOWN") as BinaryBias,
      priceAction: (data.priceAction ?? "UNKNOWN") as BinaryBias,
      ema13: (data.ema13 ?? "UNKNOWN") as BinaryBias,
      rsi14: (data.rsi14 ?? "UNKNOWN") as BinaryBias,
    };
    const ambiguousPolicy: AmbiguousPolicy = data.ambiguousPolicy ?? "conservative";
    const simulation = simulateSession({
      instrument: data.instrument,
      ranked: snapshot.rankedLevels,
      candles: candles.candles,
      cubeInputs,
      ambiguousPolicy,
    });
    return {
      snapshot,
      candles,
      simulation,
      ambiguousPolicy,
      cubeInputs,
      generatedAt: new Date().toISOString(),
    };
  });