// Phase 21.4 · Stage 4C — Single-run no-double-fetch cache.
// Memoises the results of provider load, Astro run, SMC structure analysis,
// SMC signal analysis, and Hybrid resolution for one backtest invocation.
// Tests use the exposed counter to assert each side is called exactly once.

export type SingleRunCache<K, V> = {
  get(key: K, produce: () => Promise<V>): Promise<V>;
  getSync(key: K, produce: () => V): V;
  calls(key: K): number;
  clear(): void;
};

export function createSingleRunCache<K, V>(): SingleRunCache<K, V> {
  const store = new Map<K, V | Promise<V>>();
  const calls = new Map<K, number>();
  return {
    async get(key, produce) {
      const hit = store.get(key);
      if (hit !== undefined) return hit;
      const p = produce();
      store.set(key, p);
      calls.set(key, (calls.get(key) ?? 0) + 1);
      const v = await p;
      store.set(key, v);
      return v;
    },
    getSync(key, produce) {
      const hit = store.get(key);
      if (hit !== undefined) return hit as V;
      const v = produce();
      store.set(key, v);
      calls.set(key, (calls.get(key) ?? 0) + 1);
      return v;
    },
    calls(key) {
      return calls.get(key) ?? 0;
    },
    clear() {
      store.clear();
      calls.clear();
    },
  };
}