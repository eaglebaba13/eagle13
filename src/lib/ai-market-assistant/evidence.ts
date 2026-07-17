// Phase 3B — Evidence model helpers. Pure. Deterministic.

import type {
  AssistantBias,
  AssistantConfidence,
  DataQualityView,
  EvidenceItem,
} from "./types";

export function countByBias(evidence: readonly EvidenceItem[]) {
  let bull = 0, bear = 0, neutral = 0, conflict = 0, unavailable = 0;
  for (const e of evidence) {
    if (!e.available) { unavailable++; continue; }
    switch (e.bias) {
      case "BULLISH": bull++; break;
      case "BEARISH": bear++; break;
      case "NEUTRAL": neutral++; break;
      case "CONFLICT": conflict++; break;
      default: unavailable++; break;
    }
  }
  return { bull, bear, neutral, conflict, unavailable, total: evidence.length };
}

export function deriveMarketBias(evidence: readonly EvidenceItem[]): AssistantBias {
  const c = countByBias(evidence);
  const available = c.total - c.unavailable;
  if (available === 0) return "UNAVAILABLE";
  // Require at least 2 directional signals or unanimity of what's available.
  const directional = c.bull + c.bear;
  if (directional === 0) return "NEUTRAL";
  if (c.bull > 0 && c.bear > 0) {
    // Strong majority (≥ 2× the opposing) resolves to majority; else CONFLICT.
    if (c.bull >= c.bear * 2 && c.bull - c.bear >= 2) return "BULLISH";
    if (c.bear >= c.bull * 2 && c.bear - c.bull >= 2) return "BEARISH";
    return "CONFLICT";
  }
  if (c.bull > 0) return "BULLISH";
  if (c.bear > 0) return "BEARISH";
  return "NEUTRAL";
}

export function summariseDataQuality(evidence: readonly EvidenceItem[]): DataQualityView {
  let live = 0, demo = 0, stale = 0, unavailable = 0;
  for (const e of evidence) {
    if (!e.available) { unavailable++; continue; }
    if (e.freshness === "LIVE") live++;
    else if (e.freshness === "MIXED") live++; // treat mixed as live-ish
    else if (e.freshness === "STALE") stale++;
    else if (e.freshness === "RESEARCH_DEMO") demo++;
    else unavailable++;
  }
  let label: DataQualityView["label"] = "UNAVAILABLE";
  if (live > 0 && demo === 0 && stale === 0) label = "LIVE";
  else if (live > 0) label = "MIXED";
  else if (demo > 0) label = "RESEARCH_DEMO";
  return { total: evidence.length, live, demo, stale, unavailable, label };
}

export function deriveConfidence(
  evidence: readonly EvidenceItem[],
  bias: AssistantBias,
  runtimeDegraded: boolean,
): AssistantConfidence {
  if (bias === "UNAVAILABLE") return "UNAVAILABLE";
  const q = summariseDataQuality(evidence);
  if (q.total === 0 || q.unavailable === q.total) return "UNAVAILABLE";
  if (bias === "CONFLICT") return "LOW";
  const c = countByBias(evidence);
  const available = c.total - c.unavailable;
  const dominant = bias === "BULLISH" ? c.bull : bias === "BEARISH" ? c.bear : c.neutral;
  const alignmentRatio = available > 0 ? dominant / available : 0;

  let level: AssistantConfidence = "MEDIUM";
  if (alignmentRatio >= 0.75 && available >= 3) level = "HIGH";
  else if (alignmentRatio >= 0.5) level = "MEDIUM";
  else level = "LOW";

  // Degrade for stale / demo / runtime problems.
  if (q.label === "RESEARCH_DEMO") level = "LOW";
  else if (q.demo > 0 || q.stale > 0) level = downgrade(level);
  if (runtimeDegraded) level = downgrade(level);
  if (q.unavailable >= q.total / 2) level = downgrade(level);
  return level;
}

function downgrade(c: AssistantConfidence): AssistantConfidence {
  if (c === "HIGH") return "MEDIUM";
  if (c === "MEDIUM") return "LOW";
  return c;
}

export function splitSupportConflict(
  evidence: readonly EvidenceItem[],
  bias: AssistantBias,
): { supporting: EvidenceItem[]; conflicting: EvidenceItem[] } {
  if (bias === "UNAVAILABLE" || bias === "NEUTRAL" || bias === "CONFLICT") {
    return { supporting: [], conflicting: [] };
  }
  const supporting: EvidenceItem[] = [];
  const conflicting: EvidenceItem[] = [];
  for (const e of evidence) {
    if (!e.available) continue;
    if (e.bias === bias) supporting.push(e);
    else if (
      (bias === "BULLISH" && e.bias === "BEARISH") ||
      (bias === "BEARISH" && e.bias === "BULLISH")
    ) {
      conflicting.push(e);
    }
  }
  return { supporting, conflicting };
}