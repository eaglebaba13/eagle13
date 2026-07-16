// Phase 27 · Stage 3 — Persistent bounded history for GTI research readings.

import type {
  GtiResearchReading,
  GtiResearchState,
  MarketBreadthSnapshot,
  VixRegime,
  PcrConfirmationState,
} from "./types";

export const MARKET_BREADTH_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_MARKET_BREADTH_HISTORY_KEY = "eb.market-breadth.history.v1";
export const DEFAULT_MARKET_BREADTH_HISTORY_MAX = 500;

export interface PersistedGtiPoint {
  readonly runId: string;
  readonly timestamp: string;
  readonly state: GtiResearchState;
  readonly confidence: number;
  readonly broadNet: number | null;
  readonly nifty50Net: number | null;
  readonly topWeightedNet: number | null;
  readonly bankingNet: number | null;
  readonly itNet: number | null;
  readonly oilGasNet: number | null;
  readonly autoNet: number | null;
  readonly vix: number | null;
  readonly vixRegime: VixRegime;
  readonly pcrScore: number | null;
  readonly pcrState: PcrConfirmationState;
  readonly conflictCount: number;
}

export interface PersistedGtiEnvelope {
  readonly schema: number;
  readonly points: readonly PersistedGtiPoint[];
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function inMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

export function browserStorage(): StorageAdapter | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return {
      getItem: (k) => window.localStorage.getItem(k),
      setItem: (k, v) => window.localStorage.setItem(k, v),
      removeItem: (k) => window.localStorage.removeItem(k),
    };
  } catch { return null; }
}

function pickNet(s: MarketBreadthSnapshot | null): number | null {
  if (!s || s.dataQuality === "FAILED") return null;
  return s.weightedBreadth ?? s.netBreadth ?? null;
}

export function readingToPersisted(r: GtiResearchReading): PersistedGtiPoint {
  const sectors = r.breadth.sectors;
  const findSector = (universe: string): MarketBreadthSnapshot | null =>
    sectors.find((s) => s.universe === universe) ?? null;
  return {
    runId: r.runId,
    timestamp: r.timestamp,
    state: r.state,
    confidence: r.confidence,
    broadNet: pickNet(r.breadth.broad),
    nifty50Net: pickNet(r.breadth.nifty50),
    topWeightedNet: pickNet(r.breadth.topWeighted),
    bankingNet: pickNet(findSector("SECTOR_BANKING")),
    itNet: pickNet(findSector("SECTOR_IT")),
    oilGasNet: pickNet(findSector("SECTOR_OIL_GAS")),
    autoNet: pickNet(findSector("SECTOR_AUTO")),
    vix: r.vix.currentVix,
    vixRegime: r.vix.regime,
    pcrScore: r.pcr.combinedScore,
    pcrState: r.pcr.confirmedState,
    conflictCount: r.conflicts.length,
  };
}

function safeParse(raw: string | null): PersistedGtiEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const env = parsed as Partial<PersistedGtiEnvelope>;
    if (env.schema !== MARKET_BREADTH_HISTORY_SCHEMA_VERSION) return null;
    if (!Array.isArray(env.points)) return null;
    const clean = env.points.filter((p): p is PersistedGtiPoint =>
      !!p && typeof p === "object" &&
      typeof (p as PersistedGtiPoint).runId === "string" &&
      typeof (p as PersistedGtiPoint).timestamp === "string",
    );
    return { schema: MARKET_BREADTH_HISTORY_SCHEMA_VERSION, points: clean };
  } catch { return null; }
}

export interface PersistentHistoryOptions {
  readonly storage?: StorageAdapter | null;
  readonly key?: string;
  readonly max?: number;
}

export class PersistentMarketBreadthHistory {
  private readonly storage: StorageAdapter;
  private readonly key: string;
  private readonly max: number;

  constructor(opts: PersistentHistoryOptions = {}) {
    this.storage = opts.storage ?? browserStorage() ?? inMemoryStorage();
    this.key = opts.key ?? DEFAULT_MARKET_BREADTH_HISTORY_KEY;
    this.max = Math.max(10, opts.max ?? DEFAULT_MARKET_BREADTH_HISTORY_MAX);
  }

  load(): readonly PersistedGtiPoint[] {
    const env = safeParse(this.storage.getItem(this.key));
    if (!env) {
      try { this.storage.removeItem(this.key); } catch { /* ignore */ }
      return [];
    }
    return env.points;
  }

  append(point: PersistedGtiPoint): readonly PersistedGtiPoint[] {
    const existing = this.load();
    if (existing.some((p) => p.runId === point.runId && p.timestamp === point.timestamp)) {
      return existing;
    }
    const next = [...existing, point];
    while (next.length > this.max) next.shift();
    const env: PersistedGtiEnvelope = { schema: MARKET_BREADTH_HISTORY_SCHEMA_VERSION, points: next };
    try { this.storage.setItem(this.key, JSON.stringify(env)); } catch { /* quota */ }
    return next;
  }

  clear(): void {
    try { this.storage.removeItem(this.key); } catch { /* ignore */ }
  }

  get capacity(): number { return this.max; }
}
