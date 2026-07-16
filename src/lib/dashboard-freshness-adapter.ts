// Phase 24D · Dashboard freshness adapter.
//
// Pure mapping from the shared MARKET_DATA query snapshot to per-dependency
// freshness classifications. Never fetches, never mutates. Missing provider
// timestamps fall back to receivedTimestamp only when explicitly labeled;
// callers see the fallback in `FreshnessResult.reason`.

import {
  classifyFreshness,
  type FreshnessInput,
  type FreshnessResult,
  type MarketSessionStatus,
  type ProviderStatus,
} from "./data-freshness";
import type { IndexQuote } from "./market.functions";

export type DashboardFreshnessDependency =
  | "MARKET_DATA"
  | "GOLD_SILVER_RATIO"
  | "ASTRO_SNAPSHOT"
  | "DECISION_SNAPSHOT"
  | "OPTIONS_CHAIN"
  | "MARKET_BREADTH";

export type DashboardFreshnessMap = Record<DashboardFreshnessDependency, FreshnessResult>;

export type DashboardFreshnessSource = {
  nifty?: Pick<IndexQuote, "updatedAt" | "marketState"> | null;
  banknifty?: Pick<IndexQuote, "updatedAt" | "marketState"> | null;
  gold?: Pick<IndexQuote, "updatedAt" | "marketState"> | null;
  silver?: Pick<IndexQuote, "updatedAt" | "marketState"> | null;
  queryReceivedAt?: number | null;
  providerStatus?: ProviderStatus;
  now?: number;
};

const EXPECTED_MS: Record<DashboardFreshnessDependency, number> = {
  MARKET_DATA: 30_000,
  GOLD_SILVER_RATIO: 60_000,
  ASTRO_SNAPSHOT: 5 * 60_000,
  DECISION_SNAPSHOT: 5 * 60_000,
  OPTIONS_CHAIN: 60_000,
  MARKET_BREADTH: 60_000,
};

function session(q?: { marketState?: "OPEN" | "CLOSED" } | null): MarketSessionStatus {
  if (!q) return "UNKNOWN";
  return q.marketState === "OPEN" ? "OPEN" : "CLOSED";
}

function oldest(...quotes: Array<{ updatedAt?: string } | null | undefined>): string | null {
  let min: number | null = null;
  let iso: string | null = null;
  for (const q of quotes) {
    if (!q?.updatedAt) continue;
    const t = Date.parse(q.updatedAt);
    if (Number.isNaN(t)) continue;
    if (min == null || t < min) {
      min = t;
      iso = q.updatedAt;
    }
  }
  return iso;
}

function derive(
  dep: DashboardFreshnessDependency,
  src: DashboardFreshnessSource,
): FreshnessResult {
  const expectedUpdateMs = EXPECTED_MS[dep];
  const now = src.now ?? Date.now();
  const providerStatus = src.providerStatus ?? "UNKNOWN";

  let providerTimestamp: string | null = null;
  let marketSession: MarketSessionStatus = "UNKNOWN";

  switch (dep) {
    case "MARKET_DATA": {
      providerTimestamp = oldest(src.nifty, src.banknifty);
      marketSession = session(src.nifty ?? src.banknifty);
      break;
    }
    case "GOLD_SILVER_RATIO": {
      providerTimestamp = oldest(src.gold, src.silver);
      marketSession = session(src.gold ?? src.silver);
      break;
    }
    case "ASTRO_SNAPSHOT":
    case "DECISION_SNAPSHOT":
    case "OPTIONS_CHAIN":
    case "MARKET_BREADTH": {
      providerTimestamp = oldest(src.nifty, src.banknifty);
      marketSession = session(src.nifty ?? src.banknifty);
      break;
    }
  }

  const input: FreshnessInput = {
    providerTimestamp,
    receivedTimestamp: providerTimestamp == null && src.queryReceivedAt != null
      ? src.queryReceivedAt
      : null,
    expectedUpdateMs,
    marketSession,
    providerStatus,
    now,
  };

  const result = classifyFreshness(input);
  if (providerTimestamp == null && src.queryReceivedAt != null) {
    return {
      ...result,
      reason: `${result.reason} (using receivedTimestamp fallback — provider timestamp unavailable)`,
    };
  }
  return result;
}

export function deriveDashboardFreshness(
  src: DashboardFreshnessSource,
): DashboardFreshnessMap {
  const deps: DashboardFreshnessDependency[] = [
    "MARKET_DATA",
    "GOLD_SILVER_RATIO",
    "ASTRO_SNAPSHOT",
    "DECISION_SNAPSHOT",
    "OPTIONS_CHAIN",
    "MARKET_BREADTH",
  ];
  const out = {} as DashboardFreshnessMap;
  for (const d of deps) out[d] = derive(d, src);
  return out;
}