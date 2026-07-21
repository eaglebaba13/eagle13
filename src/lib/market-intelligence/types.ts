// Phase 44C — Institutional Market Intelligence Engine
// Shared types. Additive layer; no changes to Decision/Astro/PCR/Options.

export type DataQuality = "LIVE" | "FRESH" | "STALE" | "PARTIAL" | "UNAVAILABLE";

export type InstitutionalBias =
  | "STRONG_BUY"
  | "BUY"
  | "NEUTRAL"
  | "SELL"
  | "STRONG_SELL";

export type MacroRisk = "LOW" | "MEDIUM" | "HIGH";

export type NewsSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";
export type NewsImpact = "LOW" | "MEDIUM" | "HIGH";

export interface SectionEnvelope<T> {
  readonly source: string;
  readonly fetchedAt: string | null;
  readonly publishedAt: string | null;
  readonly freshness: DataQuality;
  readonly status: DataQuality;
  readonly confidence: number; // 0..1
  readonly completeness: number; // 0..1
  readonly data: T | null;
}

export interface FiiDiiRow {
  readonly tradeDate: string; // ISO date (yyyy-mm-dd)
  readonly fiiBuy: number;
  readonly fiiSell: number;
  readonly fiiNet: number;
  readonly diiBuy: number;
  readonly diiSell: number;
  readonly diiNet: number;
}

export interface FiiDiiSection {
  readonly latest: FiiDiiRow | null;
  readonly previous: FiiDiiRow | null;
  readonly dailyChange: number | null;
  readonly trend: readonly FiiDiiRow[];
  readonly institutionalBias: InstitutionalBias;
}

export interface GlobalMarketRow {
  readonly symbol: string;
  readonly label: string;
  readonly last: number | null;
  readonly change: number | null;
  readonly changePct: number | null;
  readonly status: "OPEN" | "CLOSED" | "PRE" | "POST" | "UNKNOWN";
  readonly contributionPct: number | null; // share of |change%| across cohort
}

export interface GlobalMarketSection {
  readonly rows: readonly GlobalMarketRow[];
  readonly compositeBiasPct: number; // -1..+1
}

export interface MacroRow {
  readonly key: string;
  readonly label: string;
  readonly last: number | null;
  readonly changePct: number | null;
}

export interface MacroSection {
  readonly rows: readonly MacroRow[];
  readonly macroRisk: MacroRisk;
  readonly reasons: readonly string[];
}

export interface SectorRow {
  readonly key: string;
  readonly label: string;
  readonly changePct: number | null;
}

export interface SectorSection {
  readonly rows: readonly SectorRow[];
  readonly strongest: readonly SectorRow[]; // top 3
  readonly weakest: readonly SectorRow[]; // bottom 3
  readonly rotationScore: number; // -100..+100
}

export interface NewsItemRaw {
  readonly headline: string;
  readonly source: string;
  readonly publishedAt: string | null;
  readonly url?: string | null;
  readonly category?: string | null;
  readonly affectedAssets?: readonly string[];
  readonly affectedSector?: string | null;
  readonly body?: string | null;
}

export interface NewsItem {
  readonly headline: string;
  readonly source: string;
  readonly publishedAt: string | null;
  readonly url: string | null;
  readonly category: string;
  readonly affectedAssets: readonly string[];
  readonly affectedSector: string | null;
  readonly importance: number; // 0..1
  readonly sentiment: NewsSentiment;
  readonly impact: NewsImpact;
}

export interface NewsSection {
  readonly items: readonly NewsItem[];
  readonly highImpact: readonly NewsItem[];
}

export interface ProbabilityInputs {
  readonly institutionalBias?: InstitutionalBias | null;
  readonly macroRisk?: MacroRisk | null;
  readonly sectorRotationScore?: number | null;
  readonly globalCompositeBiasPct?: number | null;
  readonly vix?: number | null;
  readonly breadthAdvanceDeclinePct?: number | null; // -1..+1
  readonly pcr?: number | null;
  readonly highImpactNegativeNews?: number;
  readonly highImpactPositiveNews?: number;
}

export interface ProbabilityResult {
  readonly bullishPct: number;
  readonly bearishPct: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly missing: readonly string[];
  readonly conflicts: readonly string[];
}

export interface IntelligenceSnapshot {
  readonly generatedAt: string;
  readonly fiiDii: SectionEnvelope<FiiDiiSection>;
  readonly global: SectionEnvelope<GlobalMarketSection>;
  readonly macro: SectionEnvelope<MacroSection>;
  readonly sectors: SectionEnvelope<SectorSection>;
  readonly news: SectionEnvelope<NewsSection>;
  readonly probability: ProbabilityResult;
}

export interface FreshnessThresholds {
  readonly liveMs: number;
  readonly freshMs: number;
  readonly staleMs: number;
}

export const DEFAULT_FRESHNESS: Record<string, FreshnessThresholds> = {
  fiiDii: { liveMs: 6 * 60 * 60 * 1000, freshMs: 24 * 60 * 60 * 1000, staleMs: 72 * 60 * 60 * 1000 },
  global: { liveMs: 5 * 60 * 1000, freshMs: 30 * 60 * 1000, staleMs: 6 * 60 * 60 * 1000 },
  macro: { liveMs: 15 * 60 * 1000, freshMs: 60 * 60 * 1000, staleMs: 12 * 60 * 60 * 1000 },
  sectors: { liveMs: 5 * 60 * 1000, freshMs: 30 * 60 * 1000, staleMs: 6 * 60 * 60 * 1000 },
  news: { liveMs: 10 * 60 * 1000, freshMs: 60 * 60 * 1000, staleMs: 12 * 60 * 60 * 1000 },
};