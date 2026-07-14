/**
 * Phase 20.2 — One-time localStorage → cloud migration helpers.
 * Pure logic; DB writes handled by cloud-sync.ts. Uses migration IDs to
 * guarantee we never double-import.
 */
export const LOCAL_KEYS = {
  journal: "eaglebaba.journal",
  paperTrades: "eaglebaba.paperTrades",
  riskSettings: "eaglebaba.riskSettings",
  replayPresets: "eaglebaba.replayPresets",
  watchlists: "eaglebaba.watchlists",
  layouts: "eaglebaba.layouts",
  notificationPrefs: "eaglebaba.notificationPrefs",
  decisionPrefs: "eaglebaba.decisionPrefs",
} as const;

export type LocalScope = keyof typeof LOCAL_KEYS;

export interface LocalDataSummary {
  scope: LocalScope;
  key: string;
  itemCount: number;
  sizeBytes: number;
  updatedAt: number | null;
  migrationKey: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
  removeItem?(key: string): void;
}

function safeParse(raw: string | null): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function countItems(v: unknown): number {
  if (v == null) return 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "object") return Object.keys(v as object).length;
  return 1;
}

/** Enumerate what's sitting in local storage right now. */
export function scanLocalData(storage: StorageLike, userId: string): LocalDataSummary[] {
  const out: LocalDataSummary[] = [];
  for (const [scope, key] of Object.entries(LOCAL_KEYS) as [LocalScope, string][]) {
    const raw = storage.getItem(key);
    if (raw == null || raw === "" || raw === "null" || raw === "[]" || raw === "{}") continue;
    const parsed = safeParse(raw);
    const items = countItems(parsed);
    if (items === 0) continue;
    out.push({
      scope,
      key,
      itemCount: items,
      sizeBytes: raw.length,
      updatedAt: null,
      migrationKey: `local:${scope}:${userId}`,
    });
  }
  return out;
}

/** Filter out scopes that have already been migrated. */
export function pendingMigrations(
  summaries: readonly LocalDataSummary[],
  applied: readonly string[],
): LocalDataSummary[] {
  const set = new Set(applied);
  return summaries.filter((s) => !set.has(s.migrationKey));
}

export function hasLocalData(storage: StorageLike, userId: string): boolean {
  return scanLocalData(storage, userId).length > 0;
}