// Phase 26 · Stage 5 — Rolling snapshot history.
//
// Bounded ring buffer, keyed by underlying+expiry. No timers, no I/O.
// Consumed by future PCR / OI Build-up modules.

import type { OptionChainSnapshot, OptionUnderlying } from "./types";

export type HistoryCapacity = 50 | 100 | 250 | 500;

function keyOf(u: OptionUnderlying, expiry: string): string {
  return `${u}::${expiry}`;
}

export class SnapshotHistory {
  private readonly capacity: HistoryCapacity;
  private readonly buckets = new Map<string, OptionChainSnapshot[]>();

  constructor(capacity: HistoryCapacity = 100) {
    this.capacity = capacity;
  }

  push(snap: OptionChainSnapshot): void {
    const k = keyOf(snap.instrument, snap.expiry);
    const arr = this.buckets.get(k) ?? [];
    arr.push(snap);
    while (arr.length > this.capacity) arr.shift();
    this.buckets.set(k, arr);
  }

  list(u: OptionUnderlying, expiry: string): readonly OptionChainSnapshot[] {
    return this.buckets.get(keyOf(u, expiry)) ?? [];
  }

  latest(u: OptionUnderlying, expiry: string): OptionChainSnapshot | null {
    const arr = this.buckets.get(keyOf(u, expiry));
    return arr && arr.length > 0 ? arr[arr.length - 1] : null;
  }

  size(u: OptionUnderlying, expiry: string): number {
    return this.buckets.get(keyOf(u, expiry))?.length ?? 0;
  }

  clear(): void {
    this.buckets.clear();
  }

  get maxCapacity(): HistoryCapacity {
    return this.capacity;
  }
}

/** Process-local singleton (reset per test). */
let SINGLETON = new SnapshotHistory(100);
export function getSnapshotHistory(): SnapshotHistory {
  return SINGLETON;
}
export function _resetSnapshotHistory(capacity: HistoryCapacity = 100): void {
  SINGLETON = new SnapshotHistory(capacity);
}