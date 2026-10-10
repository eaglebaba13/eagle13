import {
  buildCrossAssetCsv,
  buildCrossAssetJson,
  CROSS_ASSET_ENGINE_VERSION,
  type CrossAssetRow,
} from "@/lib/backtest/cross-asset";

// Research panel classification and export-action helpers.
// Extracted from `ResearchPanel.tsx` so that module only exports components +
// its review markers (React Fast Refresh).

export function classifyDegradation(
  pct: number,
  tradeCount: number,
): "STABLE" | "MILD" | "MATERIAL" | "SEVERE" | "INSUFFICIENT_DATA" {
  if (tradeCount < 20) return "INSUFFICIENT_DATA";
  const a = Math.abs(pct);
  if (a <= 10) return "STABLE";
  if (a <= 25) return "MILD";
  if (a <= 50) return "MATERIAL";
  return "SEVERE";
}

// A mounted section owns callbacks, never a cached timestamp. Each action captures
// its own provenance immediately before the deterministic builder serializes it.
export function createCrossAssetExportActions(
  rows: readonly CrossAssetRow[],
  researchRunId: string,
  extras: Parameters<typeof buildCrossAssetJson>[2],
) {
  return {
    csv() {
      const generatedAt = new Date().toISOString();
      return buildCrossAssetCsv(rows, {
        researchRunId,
        generatedAt,
        engineVersion: CROSS_ASSET_ENGINE_VERSION,
      });
    },
    json() {
      const generatedAt = new Date().toISOString();
      return buildCrossAssetJson(
        rows,
        { researchRunId, generatedAt, engineVersion: CROSS_ASSET_ENGINE_VERSION },
        extras,
      );
    },
  };
}
