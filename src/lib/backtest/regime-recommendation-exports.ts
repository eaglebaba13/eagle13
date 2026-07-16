// Phase 21.8 · Stage 1 — Recommendation exports.
import type { RegimeRecommendation, StrategyRanking } from "./regime-recommendation";

export const RECOMMENDATION_EXPORT_DISCLAIMER =
  "RESEARCH RECOMMENDATION — NOT A LIVE TRADE SIGNAL";

function csvEscape(s: unknown): string {
  const v = s == null ? "" : String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function header(rec: RegimeRecommendation): string {
  return [
    `# ${RECOMMENDATION_EXPORT_DISCLAIMER}`,
    `# runId=${rec.runId}`,
    `# instrument=${rec.instrument} timeframe=${rec.timeframe} regime=${rec.regime}`,
    `# status=${rec.recommendationStatus} confidence=${rec.confidence.toFixed(3)} score=${rec.score.toFixed(3)}`,
  ].join("\n");
}

export function exportRecommendationCsv(rec: RegimeRecommendation): string {
  const rows = [
    header(rec),
    ["strategy", "formula", "runId", "score", "blocked", "reasons", "blockingReasons"].join(","),
  ];
  const all = [...rec.rankings, ...rec.rejectedStrategies];
  for (const r of all) {
    rows.push(
      [
        r.strategy,
        r.formula,
        r.runId ?? "",
        r.score.toFixed(6),
        r.blocked ? "true" : "false",
        csvEscape(r.reasons.join(" | ")),
        csvEscape(r.blockingReasons.join(" | ")),
      ].join(","),
    );
  }
  return rows.join("\n");
}

export function exportRecommendationJson(rec: RegimeRecommendation): string {
  return JSON.stringify(
    {
      disclaimer: RECOMMENDATION_EXPORT_DISCLAIMER,
      version: rec.version,
      runId: rec.runId,
      instrument: rec.instrument,
      timeframe: rec.timeframe,
      regime: rec.regime,
      recommendedStrategy: rec.recommendedStrategy,
      recommendedFormula: rec.recommendedFormula,
      status: rec.recommendationStatus,
      confidence: rec.confidence,
      score: rec.score,
      reasons: rec.reasons,
      warnings: rec.warnings,
      metricContributions: rec.metricContributions,
      rankings: rec.rankings,
      rejectedStrategies: rec.rejectedStrategies,
      sampleAdequacy: rec.sampleAdequacy,
      evidence: rec.evidence,
    },
    null,
    2,
  );
}

export function exportRegimeRankingCsv(recs: readonly RegimeRecommendation[]): string {
  const rows = [
    `# ${RECOMMENDATION_EXPORT_DISCLAIMER}`,
    ["regime", "instrument", "timeframe", "best", "score", "confidence", "status", "runId"].join(","),
  ];
  for (const r of recs) {
    rows.push(
      [
        r.regime,
        r.instrument,
        r.timeframe,
        r.recommendedStrategy ?? "",
        r.score.toFixed(6),
        r.confidence.toFixed(6),
        r.recommendationStatus,
        r.runId,
      ].join(","),
    );
  }
  return rows.join("\n");
}

export function exportInstrumentTimeframeMatrixCsv(
  recs: readonly RegimeRecommendation[],
): string {
  const rows = [
    `# ${RECOMMENDATION_EXPORT_DISCLAIMER}`,
    ["instrument", "timeframe", "regime", "best", "score", "confidence", "status", "runId"].join(","),
  ];
  for (const r of recs) {
    rows.push(
      [
        r.instrument,
        r.timeframe,
        r.regime,
        r.recommendedStrategy ?? "",
        r.score.toFixed(6),
        r.confidence.toFixed(6),
        r.recommendationStatus,
        r.runId,
      ].join(","),
    );
  }
  return rows.join("\n");
}

export function exportRejectedStrategiesCsv(rec: RegimeRecommendation): string {
  const rows = [
    header(rec),
    ["strategy", "formula", "runId", "score", "blockingReasons"].join(","),
  ];
  for (const r of rec.rejectedStrategies as readonly StrategyRanking[]) {
    rows.push(
      [
        r.strategy,
        r.formula,
        r.runId ?? "",
        r.score.toFixed(6),
        csvEscape(r.blockingReasons.join(" | ")),
      ].join(","),
    );
  }
  return rows.join("\n");
}
