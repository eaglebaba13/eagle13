// Server-side response cache with stale-while-revalidate (SWR) semantics and
// in-flight request coalescing. Lives at module scope so a warm server isolate
// shares one cached value across concurrent users and never fires duplicate
// upstream requests for the same key.
//
// This is a pure engineering/transport optimization: it does NOT alter any
// business logic, formula, or API shape. The loader it wraps returns exactly
// what it always returned; callers just receive it faster and the upstream is
// hit far less often.

type CacheEntry<T> = {
  value: T;
  /** Fresh until this timestamp (ms). */
  freshUntil: number;
  /** Serve stale (while revalidating) until this timestamp (ms). */
  staleUntil: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// Passive counters (dev diagnostics). No behavioural impact.
type CacheKeyStats = {
  hits: number;      // fresh hits
  staleHits: number; // served-stale-while-revalidating
  misses: number;    // cold or expired -> awaited upstream
  refreshes: number; // background revalidations completed
  errors: number;    // upstream failures during revalidate
  lastRefreshMs: number | null;
};
const stats = new Map<string, CacheKeyStats>();
function bucket(key: string): CacheKeyStats {
  let s = stats.get(key);
  if (!s) {
    s = { hits: 0, staleHits: 0, misses: 0, refreshes: 0, errors: 0, lastRefreshMs: null };
    stats.set(key, s);
  }
  return s;
}

export type CacheOptions = {
  /** Freshness window in ms. */
  ttlMs: number;
  /** Extra window during which a stale value is served while refreshing. */
  swrMs?: number;
};

function revalidate<T>(key: string, ttlMs: number, swrMs: number, loader: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const p = loader()
    .then((value) => {
      const now = Date.now();
      store.set(key, { value, freshUntil: now + ttlMs, staleUntil: now + ttlMs + swrMs });
      const s = bucket(key);
      s.refreshes += 1;
      s.lastRefreshMs = now;
      return value;
    })
    .catch((err) => {
      bucket(key).errors += 1;
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, p);
  return p;
}

/**
 * Return a cached value for `key`, refreshing via `loader` when needed.
 *
 * - Fresh entry  → returned immediately.
 * - Stale entry  → returned immediately AND refreshed in the background (SWR).
 * - No/expired   → awaits a single coalesced upstream request.
 */
export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  const { ttlMs } = opts;
  const swrMs = opts.swrMs ?? ttlMs;
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry && now < entry.freshUntil) {
    bucket(key).hits += 1;
    return entry.value;
  }

  if (entry && now < entry.staleUntil) {
    bucket(key).staleHits += 1;
    // Serve stale immediately; refresh in the background. Swallow background
    // errors so a transient upstream failure never rejects a served response.
    revalidate(key, ttlMs, swrMs, loader).catch(() => {});
    return entry.value;
  }

  bucket(key).misses += 1;
  // Cold or fully expired: await one coalesced request. If it fails but we
  // still hold an (expired) value, fall back to it rather than throwing.
  try {
    return await revalidate(key, ttlMs, swrMs, loader);
  } catch (err) {
    if (entry) return entry.value;
    throw err;
  }
}

/** Clear one key or the whole cache (used by tests). */
export function clearServerCache(key?: string): void {
  if (key) {
    store.delete(key);
    inflight.delete(key);
    stats.delete(key);
  } else {
    store.clear();
    inflight.clear();
    stats.clear();
  }
}

export type CacheKeySnapshot = CacheKeyStats & {
  key: string;
  hasEntry: boolean;
  freshUntil: number | null;
  staleUntil: number | null;
  ttlRemainingMs: number | null;
  inFlight: boolean;
  ageMs: number | null;
  hitRate: number; // percent of hits+staleHits over total lookups
};

export function getCacheMetrics(): {
  keys: CacheKeySnapshot[];
  totals: {
    keys: number;
    entries: number;
    inFlight: number;
    hits: number;
    staleHits: number;
    misses: number;
    refreshes: number;
    errors: number;
    hitRate: number;
  };
} {
  const now = Date.now();
  const keys: CacheKeySnapshot[] = [];
  const totals = { keys: 0, entries: 0, inFlight: 0, hits: 0, staleHits: 0, misses: 0, refreshes: 0, errors: 0, hitRate: 0 };
  // Union of stat keys and store keys.
  const allKeys = new Set<string>([...stats.keys(), ...store.keys()]);
  for (const key of allKeys) {
    const s = bucket(key);
    const entry = store.get(key);
    const total = s.hits + s.staleHits + s.misses;
    const hitRate = total > 0 ? Math.round(((s.hits + s.staleHits) / total) * 1000) / 10 : 0;
    const ageMs = s.lastRefreshMs ? now - s.lastRefreshMs : null;
    const ttlRemainingMs = entry ? Math.max(0, entry.freshUntil - now) : null;
    keys.push({
      key,
      ...s,
      hasEntry: !!entry,
      freshUntil: entry?.freshUntil ?? null,
      staleUntil: entry?.staleUntil ?? null,
      ttlRemainingMs,
      inFlight: inflight.has(key),
      ageMs,
      hitRate,
    });
    totals.hits += s.hits;
    totals.staleHits += s.staleHits;
    totals.misses += s.misses;
    totals.refreshes += s.refreshes;
    totals.errors += s.errors;
  }
  totals.keys = allKeys.size;
  totals.entries = store.size;
  totals.inFlight = inflight.size;
  const totalLookups = totals.hits + totals.staleHits + totals.misses;
  totals.hitRate = totalLookups > 0
    ? Math.round(((totals.hits + totals.staleHits) / totalLookups) * 1000) / 10
    : 0;
  return { keys: keys.sort((a, b) => a.key.localeCompare(b.key)), totals };
}