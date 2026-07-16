// Phase 27 · Stage 2 — Persistent Combined PCR history.
//
// Client-side, provider-neutral persistence. Bounded ring buffer keyed
// per ATM mode with schema versioning, deduplication (by runId +
// timestamp), corrupted-storage fallback, and a storage-adapter port so
// tests can substitute an in-memory store.
//
// Research-only. No broker paths, no decision-engine imports.

import type { CombinedPcrReading, PcrSignalState } from "./types";

export const PERSISTENT_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_PERSISTENT_HISTORY_KEY = "eb.combined-pcr.history.v1";
export const DEFAULT_PERSISTENT_HISTORY_MAX = 500;

export interface PersistedPcrPoint {
  readonly runId: string;
  readonly timestamp: string;
  readonly atmMode: string;
  readonly combinedScore: number | null;
  readonly emaFast: number | null;
  readonly emaSlow: number | null;
  readonly slope: number | null;
  readonly signalState: PcrSignalState;
  readonly confirmedState: PcrSignalState;
  readonly niftyScore: number | null;
  readonly banknityScore: number | null;
  readonly expiryNifty: string | null;
  readonly expiryBankNifty: string | null;
  readonly provider: string;
  readonly dataQuality: "OK" | "PARTIAL" | "FAILED";
  readonly snapshotIds: readonly string[];
  readonly warnings: readonly string[];
}

export interface PersistedPcrEnvelope {
  readonly schema: number;
  readonly points: readonly PersistedPcrPoint[];
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
  } catch {
    return null;
  }
}

export function readingToPersisted(
  reading: CombinedPcrReading,
  atmMode: string,
): PersistedPcrPoint {
  const nifty = reading.instruments.find((i) => i.underlying === "NIFTY");
  const bank = reading.instruments.find((i) => i.underlying === "BANKNIFTY");
  const providers = Array.from(new Set(reading.instruments.map((i) => i.provider)));
  const missing = reading.instruments.some((i) => i.missing.length > 0);
  const anyOk = reading.instruments.some((i) => i.instrumentScore != null);
  const dataQuality: "OK" | "PARTIAL" | "FAILED" = !anyOk ? "FAILED" : missing ? "PARTIAL" : "OK";
  return {
    runId: reading.runId,
    timestamp: reading.timestamp,
    atmMode,
    combinedScore: reading.combinedScore,
    emaFast: reading.emaFast,
    emaSlow: reading.emaSlow,
    slope: reading.slope,
    signalState: reading.signalState,
    confirmedState: reading.confirmedState,
    niftyScore: nifty?.instrumentScore ?? null,
    banknityScore: bank?.instrumentScore ?? null,
    expiryNifty: nifty?.expiry ?? null,
    expiryBankNifty: bank?.expiry ?? null,
    provider: providers.join("+") || "N/A",
    dataQuality,
    snapshotIds: reading.instruments.map((i) => i.snapshotId),
    warnings: reading.warnings,
  };
}

function safeParse(raw: string | null): PersistedPcrEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const env = parsed as Partial<PersistedPcrEnvelope>;
    if (env.schema !== PERSISTENT_HISTORY_SCHEMA_VERSION) return null;
    if (!Array.isArray(env.points)) return null;
    // Basic shape validation — reject entries missing required fields.
    const clean = env.points.filter((p): p is PersistedPcrPoint =>
      !!p && typeof p === "object" &&
      typeof (p as PersistedPcrPoint).runId === "string" &&
      typeof (p as PersistedPcrPoint).timestamp === "string" &&
      typeof (p as PersistedPcrPoint).atmMode === "string",
    );
    return { schema: PERSISTENT_HISTORY_SCHEMA_VERSION, points: clean };
  } catch {
    return null;
  }
}

export interface PersistentHistoryOptions {
  readonly storage?: StorageAdapter | null;
  readonly key?: string;
  readonly max?: number;
}

export class PersistentPcrHistory {
  private readonly storage: StorageAdapter;
  private readonly key: string;
  private readonly max: number;

  constructor(opts: PersistentHistoryOptions = {}) {
    this.storage = opts.storage ?? browserStorage() ?? inMemoryStorage();
    this.key = opts.key ?? DEFAULT_PERSISTENT_HISTORY_KEY;
    this.max = Math.max(10, opts.max ?? DEFAULT_PERSISTENT_HISTORY_MAX);
  }

  load(): readonly PersistedPcrPoint[] {
    const env = safeParse(this.storage.getItem(this.key));
    if (!env) {
      // corrupted or missing — clear the slot deterministically
      try { this.storage.removeItem(this.key); } catch { /* ignore */ }
      return [];
    }
    return env.points;
  }

  append(point: PersistedPcrPoint): readonly PersistedPcrPoint[] {
    const existing = this.load();
    // Deduplicate by (runId, timestamp): identical reading is ignored.
    if (existing.some((p) => p.runId === point.runId && p.timestamp === point.timestamp)) {
      return existing;
    }
    const next = [...existing, point];
    while (next.length > this.max) next.shift();
    const env: PersistedPcrEnvelope = { schema: PERSISTENT_HISTORY_SCHEMA_VERSION, points: next };
    try {
      this.storage.setItem(this.key, JSON.stringify(env));
    } catch {
      // e.g. quota exceeded — best-effort, keep in-memory return
    }
    return next;
  }

  clear(): void {
    try { this.storage.removeItem(this.key); } catch { /* ignore */ }
  }

  get capacity(): number { return this.max; }
}