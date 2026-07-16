// Phase 23 · Stage 2 — Trusted live data provider contract.
// Provider-neutral interface. No broker imports. No order placement.
// Adapters MUST return only genuinely-supported data; they must never
// fabricate candles or up-sample daily bars into intraday bars.

import type {
  DataQualityState,
  ShadowClosedCandle,
  ShadowDataSnapshot,
} from "./shadow-types";

export type ProviderHealthStatus =
  | "HEALTHY"
  | "DELAYED"
  | "STALE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "AUTH_REQUIRED";

export type ProviderHealth = {
  readonly status: ProviderHealthStatus;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
  readonly latencyMs: number;
  readonly errorRate: number;
  readonly freshnessSeconds: number;
  readonly supportedInstruments: readonly string[];
  readonly supportedTimeframes: readonly string[];
  readonly limitations: readonly string[];
};

export type MarketHours = {
  readonly timezone: string;
  readonly openHHMM: string; // "09:15"
  readonly closeHHMM: string; // "15:30"
  readonly is247: boolean;
};

export type ProviderFetchRequest = {
  readonly instrument: string;
  readonly timeframe: string;
  readonly session: string;
  readonly nowIso: string;
};

export type ProviderFetchResponse =
  | {
      readonly ok: true;
      readonly snapshot: ShadowDataSnapshot;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "LIVE_DATA_UNAVAILABLE"
        | "UNSUPPORTED_INSTRUMENT"
        | "UNSUPPORTED_TIMEFRAME"
        | "RATE_LIMITED"
        | "AUTH_REQUIRED"
        | "PROVIDER_ERROR";
      readonly detail?: string;
    };

export interface LiveDataProviderAdapter {
  readonly id: string;
  readonly label: string;
  readonly supportedInstruments: readonly string[];
  readonly supportedTimeframes: readonly string[];
  readonly timezone: string;
  readonly marketHours: MarketHours;
  fetchLatestClosedCandles(req: ProviderFetchRequest): Promise<ProviderFetchResponse>;
  getProviderHealth(): ProviderHealth;
  classifyFreshness(ageSeconds: number): DataQualityState;
  buildDataHash(candles: readonly ShadowClosedCandle[], providerId: string): string;
}

// FNV-1a over the concatenated candle key stream + provider id.
export function buildDataHash(
  candles: readonly ShadowClosedCandle[],
  providerId: string,
): string {
  let h = 0x811c9dc5;
  const write = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  write(providerId);
  for (const c of candles) {
    write("|");
    write(c.date);
    write(":");
    write(String(c.open));
    write(":");
    write(String(c.high));
    write(":");
    write(String(c.low));
    write(":");
    write(String(c.close));
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function classifyFreshnessDefault(
  ageSeconds: number,
  opts: { liveMax: number; delayedMax: number },
): DataQualityState {
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0) return "MISSING";
  if (ageSeconds <= opts.liveMax) return "LIVE";
  if (ageSeconds <= opts.delayedMax) return "DELAYED";
  return "STALE";
}

// ---- Mock adapter ---------------------------------------------------------

export type MockAdapterConfig = {
  readonly id?: string;
  readonly label?: string;
  readonly instruments: readonly string[];
  readonly timeframes: readonly string[];
  readonly timezone: string;
  readonly marketHours: MarketHours;
  readonly candles: readonly ShadowClosedCandle[];
  readonly providerTimestamp: string;
  readonly ageSeconds: number;
  readonly health?: Partial<ProviderHealth>;
};

export function createMockAdapter(cfg: MockAdapterConfig): LiveDataProviderAdapter {
  const id = cfg.id ?? "mock";
  const label = cfg.label ?? "Mock Adapter";
  const health: ProviderHealth = {
    status: cfg.health?.status ?? "HEALTHY",
    lastSuccessAt: cfg.health?.lastSuccessAt ?? cfg.providerTimestamp,
    lastFailureAt: cfg.health?.lastFailureAt ?? null,
    latencyMs: cfg.health?.latencyMs ?? 0,
    errorRate: cfg.health?.errorRate ?? 0,
    freshnessSeconds: cfg.health?.freshnessSeconds ?? cfg.ageSeconds,
    supportedInstruments: cfg.instruments,
    supportedTimeframes: cfg.timeframes,
    limitations: cfg.health?.limitations ?? [],
  };
  return {
    id,
    label,
    supportedInstruments: cfg.instruments,
    supportedTimeframes: cfg.timeframes,
    timezone: cfg.timezone,
    marketHours: cfg.marketHours,
    getProviderHealth: () => health,
    classifyFreshness: (age) =>
      classifyFreshnessDefault(age, { liveMax: 30, delayedMax: 900 }),
    buildDataHash: (candles, providerId) => buildDataHash(candles, providerId),
    async fetchLatestClosedCandles(req) {
      if (!cfg.instruments.includes(req.instrument))
        return { ok: false, reason: "UNSUPPORTED_INSTRUMENT" };
      if (!cfg.timeframes.includes(req.timeframe))
        return { ok: false, reason: "UNSUPPORTED_TIMEFRAME" };
      if (cfg.candles.length === 0)
        return { ok: false, reason: "LIVE_DATA_UNAVAILABLE" };
      const snapshot: ShadowDataSnapshot = {
        instrument: req.instrument,
        timeframe: req.timeframe,
        session: req.session,
        providerId: id,
        providerTimestamp: cfg.providerTimestamp,
        timezone: cfg.timezone,
        dataHash: buildDataHash(cfg.candles, id),
        quality: classifyFreshnessDefault(cfg.ageSeconds, {
          liveMax: 30,
          delayedMax: 900,
        }),
        ageSeconds: cfg.ageSeconds,
        candles: cfg.candles,
      };
      return { ok: true, snapshot };
    },
  };
}

// ---- CSV-replay adapter ---------------------------------------------------

export function createCsvReplayAdapter(cfg: MockAdapterConfig): LiveDataProviderAdapter {
  return createMockAdapter({ ...cfg, id: cfg.id ?? "csv-replay", label: cfg.label ?? "CSV Replay" });
}

// ---- Unavailable adapter (Yahoo/broker placeholder) ----------------------

export function createUnavailableAdapter(id: string, label: string): LiveDataProviderAdapter {
  const health: ProviderHealth = {
    status: "UNAVAILABLE",
    lastSuccessAt: null,
    lastFailureAt: null,
    latencyMs: 0,
    errorRate: 1,
    freshnessSeconds: Number.POSITIVE_INFINITY,
    supportedInstruments: [],
    supportedTimeframes: [],
    limitations: ["LIVE_DATA_UNAVAILABLE"],
  };
  return {
    id,
    label,
    supportedInstruments: [],
    supportedTimeframes: [],
    timezone: "UTC",
    marketHours: { timezone: "UTC", openHHMM: "00:00", closeHHMM: "00:00", is247: false },
    getProviderHealth: () => health,
    classifyFreshness: () => "MISSING",
    buildDataHash: (candles) => buildDataHash(candles, id),
    async fetchLatestClosedCandles() {
      return { ok: false, reason: "LIVE_DATA_UNAVAILABLE" };
    },
  };
}