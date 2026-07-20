// Phase 3F.2C — Cloudflare-safe server adapter for the Node TradingView
// collector. This file NEVER imports @mathieuc/tradingview and NEVER runs on
// the client. It talks to the external collector over HTTPS using a
// server-only bearer secret.

import { buildSnapshot } from "./snapshot-contract";
import type {
  CollectorFreshness,
  CollectorSnapshot,
  CollectorSignal,
} from "./snapshot-contract";

const CACHE_TTL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 3_500;
const MAX_ATTEMPTS = 2;
const MAX_BODY_BYTES = 4_096;

type CacheEntry = { at: number; snapshot: CollectorSnapshot };
let cache: CacheEntry | null = null;
let lastFailureReason: string | null = null;
let lastFetchAt: string | null = null;
let lastSuccessAt: string | null = null;

export interface CollectorRuntimeConfig {
  readonly enabled: boolean;
  readonly urlConfigured: boolean;
  readonly tokenConfigured: boolean;
  readonly tokenMasked: string | null;
  readonly baseUrl: string | null;
  readonly formulaVersion: string;
}

export function readCollectorConfig(): CollectorRuntimeConfig {
  const url = process.env.TRADINGVIEW_COLLECTOR_URL ?? "";
  const token = process.env.TRADINGVIEW_COLLECTOR_API_TOKEN ?? "";
  const enabled = (process.env.TRADINGVIEW_COLLECTOR_ENABLED ?? "false")
    .toLowerCase() === "true";
  return {
    enabled,
    urlConfigured: url.length > 0,
    tokenConfigured: token.length > 0,
    tokenMasked: token ? maskToken(token) : null,
    baseUrl: url || null,
    formulaVersion: "GS_RATIO_50_80_V1",
  };
}

function maskToken(token: string): string {
  if (token.length <= 6) return "•".repeat(token.length);
  return `${token.slice(0, 3)}…${token.slice(-2)}`;
}

function unavailableSnapshot(reason: string): CollectorSnapshot {
  return buildSnapshot({
    symbol: "TVC:GOLDSILVER",
    ratio: null,
    marketTimestamp: null,
    receivedAtMs: null,
    now: Date.now(),
    connectionStatus: "UNKNOWN",
    reason,
  });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function validateRemote(raw: unknown): CollectorSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.symbol !== "TVC:GOLDSILVER") return null;
  const ratio =
    typeof r.ratio === "number" && Number.isFinite(r.ratio) && r.ratio > 0
      ? r.ratio
      : null;
  const marketTimestamp =
    typeof r.marketTimestamp === "number" ? r.marketTimestamp : null;
  const receivedAtMs =
    typeof r.receivedAt === "string" ? Date.parse(r.receivedAt) : NaN;
  const freshness = ["LIVE", "STALE", "UNAVAILABLE"].includes(String(r.freshness))
    ? (r.freshness as CollectorFreshness)
    : "UNAVAILABLE";
  const signal = ["BUY_GOLD", "BUY_SILVER", "NEUTRAL", "UNAVAILABLE"].includes(
    String(r.signal),
  )
    ? (r.signal as CollectorSignal)
    : "UNAVAILABLE";
  const connectionStatus =
    typeof r.connectionStatus === "string" ? r.connectionStatus : "UNKNOWN";

  return buildSnapshot({
    symbol: "TVC:GOLDSILVER",
    ratio,
    marketTimestamp,
    receivedAtMs: Number.isFinite(receivedAtMs) ? receivedAtMs : null,
    now: Date.now(),
    connectionStatus,
    remoteFreshness: freshness,
    remoteSignal: signal,
  });
}

export async function getGoldSilverRatioSnapshot(): Promise<CollectorSnapshot> {
  const cfg = readCollectorConfig();
  const now = Date.now();

  if (!cfg.enabled) {
    return unavailableSnapshot("Gold/Silver Ratio collector is currently disabled");
  }
  if (!cfg.urlConfigured || !cfg.tokenConfigured || !cfg.baseUrl) {
    return unavailableSnapshot("Collector URL or API token not configured");
  }

  if (cache && now - cache.at < CACHE_TTL_MS) return cache.snapshot;

  const url = cfg.baseUrl.replace(/\/$/, "") + "/v1/gold-silver-ratio";
  const token = process.env.TRADINGVIEW_COLLECTOR_API_TOKEN!;
  let lastErr: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      lastFetchAt = new Date().toISOString();
      const res = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (res.status === 401) {
        lastErr = "unauthorized";
        break; // do not retry auth failures
      }
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (text.length > MAX_BODY_BYTES) {
        lastErr = "response too large";
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        lastErr = "invalid JSON";
        continue;
      }
      const snap = validateRemote(parsed);
      if (!snap) {
        lastErr = "schema validation failed";
        continue;
      }
      cache = { at: now, snapshot: snap };
      lastFailureReason = null;
      lastSuccessAt = new Date().toISOString();
      return snap;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  lastFailureReason = lastErr;
  const snap = unavailableSnapshot(`Collector fetch failed: ${lastErr ?? "unknown"}`);
  cache = { at: now, snapshot: snap };
  return snap;
}

export function getCollectorDiagnostics() {
  return {
    lastFetchAt,
    lastSuccessAt,
    lastFailureReason,
    cacheAgeMs: cache ? Date.now() - cache.at : null,
  };
}

// Test-only reset (never called in production paths).
export const __test = {
  reset() {
    cache = null;
    lastFailureReason = null;
    lastFetchAt = null;
    lastSuccessAt = null;
  },
};