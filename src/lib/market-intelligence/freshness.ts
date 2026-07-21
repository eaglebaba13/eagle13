// Phase 44C — Freshness / status envelope helpers.
import type { DataQuality, FreshnessThresholds, SectionEnvelope } from "./types";
import { DEFAULT_FRESHNESS } from "./types";

export function classifyFreshness(
  ageMs: number | null,
  thresholds: FreshnessThresholds,
): DataQuality {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return "UNAVAILABLE";
  if (ageMs <= thresholds.liveMs) return "LIVE";
  if (ageMs <= thresholds.freshMs) return "FRESH";
  if (ageMs <= thresholds.staleMs) return "STALE";
  return "UNAVAILABLE";
}

export interface EnvelopeInput<T> {
  readonly section: keyof typeof DEFAULT_FRESHNESS | string;
  readonly source: string;
  readonly fetchedAt: string | null;
  readonly publishedAt: string | null;
  readonly data: T | null;
  readonly completeness?: number;
  readonly confidence?: number;
  readonly now?: number;
  readonly thresholds?: FreshnessThresholds;
}

export function makeEnvelope<T>(input: EnvelopeInput<T>): SectionEnvelope<T> {
  const now = input.now ?? Date.now();
  const thresholds =
    input.thresholds ??
    DEFAULT_FRESHNESS[input.section as keyof typeof DEFAULT_FRESHNESS] ??
    DEFAULT_FRESHNESS.global;
  const anchor = input.publishedAt ?? input.fetchedAt;
  const ageMs = anchor ? now - Date.parse(anchor) : null;
  const freshness = input.data == null ? "UNAVAILABLE" : classifyFreshness(ageMs, thresholds);
  const completeness = clamp01(input.completeness ?? (input.data == null ? 0 : 1));
  const baseConfidence = confidenceFor(freshness);
  const confidence = clamp01(input.confidence ?? baseConfidence * completeness);
  const status: DataQuality =
    input.data == null
      ? "UNAVAILABLE"
      : completeness < 1 && freshness !== "UNAVAILABLE"
        ? "PARTIAL"
        : freshness;
  return {
    source: input.source,
    fetchedAt: input.fetchedAt,
    publishedAt: input.publishedAt,
    freshness,
    status,
    confidence,
    completeness,
    data: input.data,
  };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function confidenceFor(q: DataQuality): number {
  switch (q) {
    case "LIVE":
      return 1;
    case "FRESH":
      return 0.85;
    case "STALE":
      return 0.5;
    case "PARTIAL":
      return 0.6;
    default:
      return 0;
  }
}