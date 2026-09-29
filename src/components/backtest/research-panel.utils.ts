// Research panel classification helpers.
// Extracted from `ResearchPanel.tsx` so that module only exports components +
// its review markers (React Fast Refresh). Behavior is unchanged.

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
