// Phase 3E — Deterministic chronological walk-forward validation.

import type {
  HistoricalRow,
  WalkForwardConfig,
  WalkForwardResult,
  WalkForwardSplit,
} from "./types";

export function walkForward(
  rows: readonly HistoricalRow[],
  config: WalkForwardConfig,
): WalkForwardResult {
  const splits: WalkForwardSplit[] = [];
  const n = rows.length;
  if (n === 0 || config.trainWindowSessions <= 0 || config.validationWindowSessions <= 0 || config.step <= 0) {
    return { config, splits };
  }
  let start = 0;
  let idx = 0;
  while (true) {
    const trainStart = config.mode === "EXPANDING" ? 0 : start;
    const trainEnd = start + config.trainWindowSessions - 1;
    const valStart = trainEnd + 1;
    const valEnd = valStart + config.validationWindowSessions - 1;
    if (valEnd >= n) break;
    splits.push({
      index: idx++,
      trainStart: rows[trainStart].sessionDate,
      trainEnd: rows[trainEnd].sessionDate,
      validationStart: rows[valStart].sessionDate,
      validationEnd: rows[valEnd].sessionDate,
      trainSamples: trainEnd - trainStart + 1,
      validationSamples: valEnd - valStart + 1,
    });
    start += config.step;
  }
  return { config, splits };
}
