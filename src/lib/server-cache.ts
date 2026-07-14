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
      return value;
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
    return entry.value;
  }

  if (entry && now < entry.staleUntil) {
    // Serve stale immediately; refresh in the background. Swallow background
    // errors so a transient upstream failure never rejects a served response.
    revalidate(key, ttlMs, swrMs, loader).catch(() => {});
    return entry.value;
  }

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
  } else {
    store.clear();
    inflight.clear();
  }
}