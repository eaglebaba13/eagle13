// Phase 26 · Stage 5 — CSV / JSON / Research Bundle export.
// Snapshot-only. No signals, no formulas, no broker context.

import type { OptionChainSnapshot } from "./types";
import type { QualityReport } from "./data-quality";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function snapshotToCsv(snap: OptionChainSnapshot): string {
  const header = [
    "strike",
    "call_oi", "call_change_oi", "call_volume", "call_iv", "call_ltp",
    "put_oi", "put_change_oi", "put_volume", "put_iv", "put_ltp",
  ];
  const rows = snap.strikes.slice().sort((a, b) => a.strike - b.strike).map((s) => [
    s.strike,
    s.call.oi, s.call.changeOi, s.call.volume, s.call.iv, s.call.ltp,
    s.put.oi, s.put.changeOi, s.put.volume, s.put.iv, s.put.ltp,
  ].map(csvEscape).join(","));
  const meta = `# instrument=${snap.instrument},expiry=${snap.expiry},spot=${snap.spotPrice ?? ""},provider=${snap.provider},timestamp=${snap.timestamp}`;
  return [meta, header.join(","), ...rows].join("\n");
}

export function snapshotToJson(snap: OptionChainSnapshot): string {
  return JSON.stringify(snap, null, 2);
}

export interface ResearchBundle {
  readonly snapshot: OptionChainSnapshot;
  readonly quality: QualityReport;
  readonly generatedAt: string;
  readonly version: 1;
}

export function buildResearchBundle(
  snap: OptionChainSnapshot,
  quality: QualityReport,
  nowIso: string = new Date().toISOString(),
): ResearchBundle {
  return { snapshot: snap, quality, generatedAt: nowIso, version: 1 };
}