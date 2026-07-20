// Pure snapshot construction + validation. Deterministic, no I/O.

export function classifySignal(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return "UNAVAILABLE";
  if (ratio < 50) return "BUY_GOLD";
  if (ratio > 80) return "BUY_SILVER";
  return "NEUTRAL";
}

export function computeFreshness(ageMs, staleAfterMs, unavailableAfterMs) {
  if (!Number.isFinite(ageMs) || ageMs < 0) return "UNAVAILABLE";
  if (ageMs > unavailableAfterMs) return "UNAVAILABLE";
  if (ageMs > staleAfterMs) return "STALE";
  return "LIVE";
}

export function isValidRatio(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/**
 * Build the canonical snapshot returned by `/v1/gold-silver-ratio`.
 * Any invalid state (missing tick, wrong symbol, expired freshness) collapses
 * to `ratio: null` + `signal: "UNAVAILABLE"`. Stale data is preserved for
 * information but marked non-actionable.
 */
export function buildSnapshot({
  symbol,
  expectedSymbol,
  ratio,
  marketTimestamp,
  receivedAtMs,
  now,
  connectionStatus,
  staleAfterMs,
  unavailableAfterMs,
  formulaVersion,
}) {
  const symbolOk = symbol === expectedSymbol;
  const ratioOk = isValidRatio(ratio);
  const receivedOk = typeof receivedAtMs === "number" && Number.isFinite(receivedAtMs);
  const ageMs = receivedOk ? Math.max(0, now - receivedAtMs) : Number.POSITIVE_INFINITY;
  const freshness = receivedOk
    ? computeFreshness(ageMs, staleAfterMs, unavailableAfterMs)
    : "UNAVAILABLE";

  const isActionable =
    symbolOk && ratioOk && (freshness === "LIVE");
  const signal = isActionable ? classifySignal(ratio) : "UNAVAILABLE";

  return {
    symbol: expectedSymbol,
    ratio: symbolOk && ratioOk && freshness !== "UNAVAILABLE" ? ratio : null,
    signal,
    source: "TRADINGVIEW_UNOFFICIAL",
    marketTimestamp: typeof marketTimestamp === "number" ? marketTimestamp : null,
    receivedAt: receivedOk ? new Date(receivedAtMs).toISOString() : null,
    ageMs: receivedOk ? ageMs : null,
    freshness,
    connectionStatus,
    formulaVersion,
  };
}