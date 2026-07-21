// Phase 44B — Deterministic morning-brief composer.
// Produces an ordered list of BriefSections that the 44A Telegram splitter
// can chunk without truncation. No I/O and no dependency on delivery.

import type { BriefSection } from "./telegram-splitter";
import { composeDisclaimerBlock } from "./disclaimers";
import type { LevelBundle } from "./level-bundle";
import type { BiasResult } from "./market-bias";
import type { PanchangBundle } from "./panchang-bundle";
import type { MacroRatioResult } from "./macro-ratio";

export const MORNING_REPORT_VERSION = "morning-brief@44B.1";
export const MORNING_REPORT_TYPE = "MORNING_BRIEF";
export const MORNING_REPORT_TIMEZONE = "Asia/Kolkata";

export type DataQuality = "LIVE" | "FRESH" | "STALE" | "CLOSED" | "PARTIAL" | "UNAVAILABLE";

export interface InstrumentBlock {
  readonly instrumentId: string;
  readonly displayName: string;
  readonly bundle: LevelBundle | null;
  readonly bias: BiasResult | null;
  readonly livePrice: number | null;
  readonly pcrIndex?: number | null;
  readonly pcrCombined?: number | null;
  readonly status: DataQuality;
}

export interface IndiaContextBlock {
  readonly indiaVix: number | null;
  readonly top5Bullish: readonly string[];
  readonly top5Bearish: readonly string[];
  readonly strongestSectors: readonly string[];
  readonly weakestSectors: readonly string[];
  readonly institutionalFlowProbability: number | null;
  readonly marketStatus: "OPEN" | "CLOSED" | "PRE_OPEN" | "UNAVAILABLE";
  readonly latestTradeDate: string | null;
  readonly status: DataQuality;
}

export interface FiiDiiBlock {
  readonly tradeDate: string | null;
  readonly fiiNet: number | null;
  readonly diiNet: number | null;
  readonly publicationStatus: "PUBLISHED" | "PENDING" | "UNAVAILABLE";
  readonly status: DataQuality;
}

export interface ComposeInput {
  readonly reportDate: string;
  readonly generatedAt: string;
  readonly reportId: string;
  readonly panchang: PanchangBundle | null;
  readonly nifty: InstrumentBlock;
  readonly banknifty: InstrumentBlock;
  readonly xauusd: InstrumentBlock;
  readonly xagusd: InstrumentBlock;
  readonly btc: InstrumentBlock;
  readonly eth: InstrumentBlock;
  readonly ratio: MacroRatioResult;
  readonly indiaContext: IndiaContextBlock;
  readonly fiiDii: FiiDiiBlock;
  readonly overallStatus: DataQuality;
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
}

function renderInstrument(b: InstrumentBlock): string {
  if (!b.bundle) return `${b.displayName}: UNAVAILABLE (${b.status})`;
  const p = b.bundle.pivot;
  const g = b.bundle.gann;
  const astro = b.bundle.astro.status === "UNAVAILABLE"
    ? "Astro: UNAVAILABLE"
    : `Astro: ${b.bundle.astro.levels.length} levels`;
  const gann = g.status === "UNAVAILABLE"
    ? "Gann: UNAVAILABLE"
    : `Gann Up ${fmt(g.up)} · Gann Down ${fmt(g.down)}`;
  const bias = b.bias ? `Bias ${b.bias.bias} (${b.bias.confidence}%)` : "Bias UNAVAILABLE";
  const pcr: string[] = [];
  if (b.pcrIndex != null) pcr.push(`Index PCR ${fmt(b.pcrIndex)}`);
  if (b.pcrCombined != null) pcr.push(`Combined PCR ${fmt(b.pcrCombined)}`);
  const pcrLine = pcr.length ? "\n" + pcr.join(" · ") : "";
  const price = b.livePrice != null ? `Price ${fmt(b.livePrice)}` : "Price UNAVAILABLE";
  return [
    `${b.displayName} — ${bias}`,
    price,
    `R3 ${fmt(p.r3)} · R2 ${fmt(p.r2)} · R1 ${fmt(p.r1)} · PP ${fmt(p.pp)} · S1 ${fmt(p.s1)} · S2 ${fmt(p.s2)} · S3 ${fmt(p.s3)}`,
    `${gann} · ${astro}${pcrLine}`,
    `Status: ${b.status}`,
  ].join("\n");
}

export function composeMorningReport(input: ComposeInput): readonly BriefSection[] {
  const header = [
    `🦅 EagleBABA Morning Intelligence`,
    `Date: ${input.reportDate} · Generated: ${input.generatedAt}`,
    `Report: ${input.reportId} · Version: ${MORNING_REPORT_VERSION}`,
    `Data quality: ${input.overallStatus} · Indian Market: ${input.indiaContext.marketStatus}`,
  ].join("\n");

  const panchangBody = input.panchang
    ? [
        `Tithi: ${input.panchang.tithi} (${input.panchang.paksha})`,
        `Nakshatra: ${input.panchang.nakshatra}`,
        `Yoga: ${input.panchang.yoga} · Karana: ${input.panchang.karana}`,
        `Moon: New in ${input.panchang.daysToNewMoon}d · Full in ${input.panchang.daysToFullMoon}d`,
      ].join("\n")
    : "Panchang: UNAVAILABLE";

  const ratio = input.ratio;
  const ratioBody = [
    `Configured EagleBABA Thresholds`,
    `Lower Threshold: ${ratio.lowerThreshold} · Upper Threshold: ${ratio.upperThreshold}`,
    `Ratio: ${ratio.ratio == null ? "UNAVAILABLE" : ratio.ratio.toFixed(2)} · Relative bias: ${ratio.macroBias}`,
    `Normalization: ${ratio.normalizationMethod} · Freshness: ${ratio.freshness}`,
  ].join("\n");

  const contextBody = [
    `India VIX: ${fmt(input.indiaContext.indiaVix)}`,
    `Top 5 Bullish F&O: ${input.indiaContext.top5Bullish.join(", ") || "UNAVAILABLE"}`,
    `Top 5 Bearish F&O: ${input.indiaContext.top5Bearish.join(", ") || "UNAVAILABLE"}`,
    `Strongest Sectors: ${input.indiaContext.strongestSectors.join(", ") || "UNAVAILABLE"}`,
    `Weakest Sectors: ${input.indiaContext.weakestSectors.join(", ") || "UNAVAILABLE"}`,
    `Institutional Flow: ${fmt(input.indiaContext.institutionalFlowProbability)}`,
    `Status: ${input.indiaContext.status}`,
  ].join("\n");

  const fiiBody = [
    `Trade date: ${input.fiiDii.tradeDate ?? "UNAVAILABLE"}`,
    `FII net: ${fmt(input.fiiDii.fiiNet)} · DII net: ${fmt(input.fiiDii.diiNet)}`,
    `Publication: ${input.fiiDii.publicationStatus} · Status: ${input.fiiDii.status}`,
  ].join("\n");

  return [
    { id: "A_HEADER", title: "", body: header, protectFromTruncation: true },
    { id: "B_PANCHANG", title: "Panchang Now", body: panchangBody },
    { id: "C_NIFTY", title: "NIFTY", body: renderInstrument(input.nifty), protectFromTruncation: true },
    { id: "D_BANKNIFTY", title: "BANKNIFTY", body: renderInstrument(input.banknifty), protectFromTruncation: true },
    { id: "E_METALS", title: "Gold & Silver", body:
        [ratioBody, "", renderInstrument(input.xauusd), "", renderInstrument(input.xagusd)].join("\n"),
      protectFromTruncation: true },
    { id: "F_CRYPTO", title: "Crypto (24x7)", body:
        [renderInstrument(input.btc), "", renderInstrument(input.eth)].join("\n"),
      protectFromTruncation: true },
    { id: "G_CONTEXT", title: "Market Context", body: contextBody },
    { id: "H_FIIDII", title: "FII / DII", body: fiiBody },
    { id: "Z_DISCLAIMER", title: "Disclaimer", body: composeDisclaimerBlock(), protectFromTruncation: true },
  ];
}

export function buildReportKey(reportDate: string): string {
  return `${reportDate}|${MORNING_REPORT_TYPE}|${MORNING_REPORT_TIMEZONE}|${MORNING_REPORT_VERSION}`;
}

export function buildReportId(reportDate: string): string {
  return `MB-${reportDate}-v${MORNING_REPORT_VERSION.split("@").pop()}`;
}