// Pure, deterministic Open Interest Build-Up classification engine.
// Classifies strike-by-strike and aggregated institutional positions based on:
//   Price ↑ + OI ↑  => Long Buildup
//   Price ↓ + OI ↑  => Short Buildup
//   Price ↑ + OI ↓  => Short Covering
//   Price ↓ + OI ↓  => Long Unwinding

export type BuildupRegime =
  | "LONG_BUILDUP"
  | "SHORT_BUILDUP"
  | "SHORT_COVERING"
  | "LONG_UNWINDING"
  | "NEUTRAL";

export type OptionLegSide = "CE" | "PE";

export interface StrikeLegInput {
  readonly strike: number;
  readonly side: OptionLegSide;
  readonly ltp: number;
  readonly priceChange: number;
  readonly oi: number;
  readonly changeOi: number;
  readonly volume?: number;
}

export interface StrikeBuildupResult {
  readonly strike: number;
  readonly side: OptionLegSide;
  readonly ltp: number;
  readonly priceChange: number;
  readonly oi: number;
  readonly changeOi: number;
  readonly regime: BuildupRegime;
  readonly sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  readonly rationale: string;
}

export interface AggregateBuildupResult {
  readonly callBuildup: BuildupRegime;
  readonly putBuildup: BuildupRegime;
  readonly dominantRegime: BuildupRegime;
  readonly institutionalSentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  readonly strikeBreakdown: readonly StrikeBuildupResult[];
  readonly counts: {
    readonly longBuildup: number;
    readonly shortBuildup: number;
    readonly shortCovering: number;
    readonly longUnwinding: number;
    readonly neutral: number;
  };
  readonly netCallChangeOi: number;
  readonly netPutChangeOi: number;
  readonly summaryText: string;
}

/**
 * Classify a single option strike leg or price/OI movement.
 */
export function classifyStrikeBuildup(
  priceChange: number,
  changeOi: number,
  side: OptionLegSide = "CE",
): { regime: BuildupRegime; sentiment: "BULLISH" | "BEARISH" | "NEUTRAL"; rationale: string } {
  // If no change in OI or price is zero/flat
  if (Math.abs(changeOi) < 1e-4 && Math.abs(priceChange) < 1e-4) {
    return {
      regime: "NEUTRAL",
      sentiment: "NEUTRAL",
      rationale: "Negligible price and OI variation",
    };
  }

  const priceUp = priceChange > 0;
  const priceDown = priceChange < 0;
  const oiUp = changeOi > 0;
  const oiDown = changeOi < 0;

  let regime: BuildupRegime = "NEUTRAL";
  if (priceUp && oiUp) {
    regime = "LONG_BUILDUP";
  } else if (priceDown && oiUp) {
    regime = "SHORT_BUILDUP";
  } else if (priceUp && oiDown) {
    regime = "SHORT_COVERING";
  } else if (priceDown && oiDown) {
    regime = "LONG_UNWINDING";
  }

  // Market sentiment interpretation:
  // For Call (CE):
  //   Long Buildup = Calls bought (Bullish)
  //   Short Buildup = Calls written / sold (Bearish)
  //   Short Covering = Call sellers closing (Mildly Bullish)
  //   Long Unwinding = Call buyers booking profit/closing (Mildly Bearish)
  // For Put (PE):
  //   Long Buildup = Puts bought (Bearish)
  //   Short Buildup = Puts written / sold (Bullish)
  //   Short Covering = Put sellers closing (Mildly Bearish)
  //   Long Unwinding = Put buyers booking profit/closing (Mildly Bullish)
  let sentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (side === "CE") {
    if (regime === "LONG_BUILDUP" || regime === "SHORT_COVERING") sentiment = "BULLISH";
    else if (regime === "SHORT_BUILDUP" || regime === "LONG_UNWINDING") sentiment = "BEARISH";
  } else {
    if (regime === "SHORT_BUILDUP" || regime === "LONG_UNWINDING") sentiment = "BULLISH";
    else if (regime === "LONG_BUILDUP" || regime === "SHORT_COVERING") sentiment = "BEARISH";
  }

  const rationale = `${regime.replace(/_/g, " ")} on ${side} (ΔP: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}, ΔOI: ${changeOi >= 0 ? "+" : ""}${changeOi.toLocaleString()})`;

  return { regime, sentiment, rationale };
}

/**
 * Classify a collection of option chain strikes and generate aggregate institutional flow assessment.
 */
export function analyzeOiBuildup(legs: readonly StrikeLegInput[]): AggregateBuildupResult {
  if (!legs || legs.length === 0) {
    return {
      callBuildup: "NEUTRAL",
      putBuildup: "NEUTRAL",
      dominantRegime: "NEUTRAL",
      institutionalSentiment: "NEUTRAL",
      strikeBreakdown: [],
      counts: {
        longBuildup: 0,
        shortBuildup: 0,
        shortCovering: 0,
        longUnwinding: 0,
        neutral: 0,
      },
      netCallChangeOi: 0,
      netPutChangeOi: 0,
      summaryText: "No option leg data available for build-up analysis.",
    };
  }

  const breakdown: StrikeBuildupResult[] = legs.map((leg) => {
    const { regime, sentiment, rationale } = classifyStrikeBuildup(
      leg.priceChange,
      leg.changeOi,
      leg.side,
    );
    return {
      strike: leg.strike,
      side: leg.side,
      ltp: leg.ltp,
      priceChange: leg.priceChange,
      oi: leg.oi,
      changeOi: leg.changeOi,
      regime,
      sentiment,
      rationale,
    };
  });

  const counts = {
    longBuildup: 0,
    shortBuildup: 0,
    shortCovering: 0,
    longUnwinding: 0,
    neutral: 0,
  };

  let callWeightedPriceChange = 0;
  let putWeightedPriceChange = 0;
  let netCallChangeOi = 0;
  let netPutChangeOi = 0;
  let totalCallOi = 0;
  let totalPutOi = 0;

  for (const b of breakdown) {
    if (b.regime === "LONG_BUILDUP") counts.longBuildup++;
    else if (b.regime === "SHORT_BUILDUP") counts.shortBuildup++;
    else if (b.regime === "SHORT_COVERING") counts.shortCovering++;
    else if (b.regime === "LONG_UNWINDING") counts.longUnwinding++;
    else counts.neutral++;

    if (b.side === "CE") {
      netCallChangeOi += b.changeOi;
      totalCallOi += b.oi;
      callWeightedPriceChange += b.priceChange * Math.max(1, Math.abs(b.changeOi));
    } else {
      netPutChangeOi += b.changeOi;
      totalPutOi += b.oi;
      putWeightedPriceChange += b.priceChange * Math.max(1, Math.abs(b.changeOi));
    }
  }

  const callBuildup = classifyStrikeBuildup(callWeightedPriceChange, netCallChangeOi, "CE").regime;
  const putBuildup = classifyStrikeBuildup(putWeightedPriceChange, netPutChangeOi, "PE").regime;

  // Determine dominant regime from strike distribution
  let dominantRegime: BuildupRegime = "NEUTRAL";
  const maxCount = Math.max(
    counts.longBuildup,
    counts.shortBuildup,
    counts.shortCovering,
    counts.longUnwinding,
  );

  if (maxCount > 0) {
    if (maxCount === counts.longBuildup) dominantRegime = "LONG_BUILDUP";
    else if (maxCount === counts.shortBuildup) dominantRegime = "SHORT_BUILDUP";
    else if (maxCount === counts.shortCovering) dominantRegime = "SHORT_COVERING";
    else if (maxCount === counts.longUnwinding) dominantRegime = "LONG_UNWINDING";
  }

  // Institutional sentiment synthesis:
  // Bullish if:
  // 1. Put Writing (Short Buildup on Puts) + Call Buying (Long Buildup on Calls)
  // 2. Heavy put additions (ΔPut OI > ΔCall OI) with Call Short Covering
  let institutionalSentiment: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (
    (callBuildup === "LONG_BUILDUP" && putBuildup === "SHORT_BUILDUP") ||
    (netPutChangeOi > netCallChangeOi * 1.25 && netPutChangeOi > 0)
  ) {
    institutionalSentiment = "BULLISH";
  } else if (
    (callBuildup === "SHORT_BUILDUP" && putBuildup === "LONG_BUILDUP") ||
    (netCallChangeOi > netPutChangeOi * 1.25 && netCallChangeOi > 0)
  ) {
    institutionalSentiment = "BEARISH";
  } else if (counts.longBuildup > counts.shortBuildup * 1.5) {
    institutionalSentiment = "BULLISH";
  } else if (counts.shortBuildup > counts.longBuildup * 1.5) {
    institutionalSentiment = "BEARISH";
  }

  const summaryText = `CE: ${callBuildup.replace(/_/g, " ")} (ΔOI: ${netCallChangeOi.toLocaleString()}), PE: ${putBuildup.replace(/_/g, " ")} (ΔOI: ${netPutChangeOi.toLocaleString()}) → Bias: ${institutionalSentiment}`;

  return {
    callBuildup,
    putBuildup,
    dominantRegime,
    institutionalSentiment,
    strikeBreakdown: breakdown,
    counts,
    netCallChangeOi,
    netPutChangeOi,
    summaryText,
  };
}

