// Namespaced in-memory TTL cache. Deliberately DISTINCT from
// `src/lib/server-cache.ts` — this namespace is `provider-foundation:*`
// so no existing cache namespace collides.

export interface CacheEntry<T> {
  readonly value: T;
  readonly storedAtMs: number;
  readonly expiresAtMs: number;
  readonly key: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  size: number;
}

export const PROVIDER_CACHE_NAMESPACE = "provider-foundation";

export class ProviderCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    evictions: 0,
    size: 0,
  };

  private nsKey(key: string): string {
    return `${PROVIDER_CACHE_NAMESPACE}:${key}`;
  }

  get<T>(key: string, nowMs: number): T | null {
    const entry = this.store.get(this.nsKey(key)) as CacheEntry<T> | undefined;
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    if (entry.expiresAtMs <= nowMs) {
      this.store.delete(this.nsKey(key));
      this.stats.evictions++;
      this.stats.size = this.store.size;
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return entry.value;
  }

  set<T>(key: string, value: T, nowMs: number, ttlMs: number): void {
    this.store.set(this.nsKey(key), {
      value,
      storedAtMs: nowMs,
      expiresAtMs: nowMs + ttlMs,
      key: this.nsKey(key),
    });
    this.stats.writes++;
    this.stats.size = this.store.size;
  }

  invalidate(key: string): void {
    if (this.store.delete(this.nsKey(key))) {
      this.stats.evictions++;
      this.stats.size = this.store.size;
    }
  }

  clear(): void {
    this.stats.evictions += this.store.size;
    this.store.clear();
    this.stats.size = 0;
  }

  snapshot(): Readonly<CacheStats> {
    return { ...this.stats };
  }

  keys(): readonly string[] {
    return Array.from(this.store.keys());
  }
}
