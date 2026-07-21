// Phase 44C — Optional Morning Brief extension sections.
import type { IntelligenceSnapshot } from "./types";

export interface MorningBriefIntelligenceSection {
  readonly title: string;
  readonly lines: readonly string[];
}

export function buildMorningBriefSections(snap: IntelligenceSnapshot): MorningBriefIntelligenceSection[] {
  const out: MorningBriefIntelligenceSection[] = [];
  if (snap.global.data && snap.global.status !== "UNAVAILABLE") {
    const top = [...snap.global.data.rows]
      .filter((r) => r.changePct != null)
      .sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number))
      .slice(0, 5)
      .map((r) => `${r.label}: ${(r.changePct as number).toFixed(2)}%`);
    out.push({ title: "Global Summary", lines: top.length ? top : ["No movers"] });
  }
  if (snap.macro.data && snap.macro.status !== "UNAVAILABLE") {
    out.push({
      title: "Macro Summary",
      lines: [`Macro risk: ${snap.macro.data.macroRisk}`, ...snap.macro.data.reasons.slice(0, 3)],
    });
  }
  if (snap.fiiDii.data && snap.fiiDii.status !== "UNAVAILABLE") {
    const l = snap.fiiDii.data.latest;
    out.push({
      title: "Institutional Summary",
      lines: l
        ? [
            `Bias: ${snap.fiiDii.data.institutionalBias}`,
            `FII net: ${l.fiiNet.toFixed(0)} Cr · DII net: ${l.diiNet.toFixed(0)} Cr`,
          ]
        : ["Unavailable"],
    });
  }
  if (snap.news.data && snap.news.data.highImpact.length > 0) {
    out.push({
      title: "Top News",
      lines: snap.news.data.highImpact.slice(0, 5).map((n) => `• ${n.headline}`),
    });
  }
  return out;
}