// Phase 3D — Deterministic OI build-up classification.
// Consumes canonical aggregated ΔOI + underlying price change. No history.

import type { AggregateBuildUp, BuildUpClass, CalcAvailability } from "./types";

function classify(priceChange: number | null, oiChange: number | null, side: "CALL" | "PUT"): BuildUpClass {
  if (priceChange == null || oiChange == null || !Number.isFinite(priceChange) || !Number.isFinite(oiChange)) {
    return "UNAVAILABLE";
  }
  const priceUp = priceChange > 0;
  const oiUp = oiChange > 0;
  // For call writers/put writers logic we normalize by side.
  // Universal build-up definitions apply to the option leg's own price+OI.
  // At the aggregate we treat call-side and put-side as leg cohorts:
  //   Call side up in price means bullish; Put side up in price means bearish.
  // Since we only have underlying price change here, we invert for the put side.
  const legPriceUp = side === "CALL" ? priceUp : !priceUp;
  if (legPriceUp && oiUp) return "LONG_BUILDUP";
  if (!legPriceUp && oiUp) return "SHORT_BUILDUP";
  if (legPriceUp && !oiUp) return "SHORT_COVERING";
  return "LONG_UNWINDING";
}

export function classifyBuildUp(input: {
  readonly underlyingPriceChange: number | null;
  readonly totalCallChangeOi: number | null;
  readonly totalPutChangeOi: number | null;
}): AggregateBuildUp {
  const { underlyingPriceChange, totalCallChangeOi, totalPutChangeOi } = input;
  const callSide = classify(underlyingPriceChange, totalCallChangeOi, "CALL");
  const putSide = classify(underlyingPriceChange, totalPutChangeOi, "PUT");

  let availability: CalcAvailability = "OK";
  if (callSide === "UNAVAILABLE" && putSide === "UNAVAILABLE") availability = "UNAVAILABLE";
  else if (callSide === "UNAVAILABLE" || putSide === "UNAVAILABLE") availability = "PARTIAL";

  // Overall: consensus if both agree on a directional class; else CONFLICT-ish → pick dominant by |ΔOI|.
  let overall: BuildUpClass = "UNAVAILABLE";
  if (callSide === putSide) overall = callSide;
  else if (availability !== "UNAVAILABLE") {
    const co = Math.abs(totalCallChangeOi ?? 0);
    const po = Math.abs(totalPutChangeOi ?? 0);
    overall = co >= po ? callSide : putSide;
  }

  const rationale =
    availability === "UNAVAILABLE"
      ? "Build-up unavailable — missing price change or ΔOI"
      : `Call side ${callSide.replace(/_/g, " ").toLowerCase()}, put side ${putSide.replace(/_/g, " ").toLowerCase()}`;

  return {
    callSide,
    putSide,
    overall,
    rationale,
    underlyingPriceChange,
    totalCallChangeOi,
    totalPutChangeOi,
    availability,
  };
}