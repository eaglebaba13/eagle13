// Phase 27 · Stage 3 — Provider-neutral MarketBreadthProvider interface.
//
// Read-only. No broker/execution logic. Adapters may wrap NSE bhavcopy,
// Upstox instrument snapshots, third-party breadth feeds, etc.

import type { MockBreadthBundle } from "./mock-provider";

export interface MarketBreadthProvider {
  readonly id: string;
  fetchBundle(): Promise<{
    readonly ok: boolean;
    readonly bundle: MockBreadthBundle | null;
    readonly latencyMs: number;
    readonly safeError: string | null;
  }>;
}

const REGISTRY = new Map<string, MarketBreadthProvider>();

export function registerMarketBreadthProvider(p: MarketBreadthProvider): void {
  REGISTRY.set(p.id, p);
}

export function getMarketBreadthProvider(id: string): MarketBreadthProvider | null {
  return REGISTRY.get(id) ?? null;
}

export function listMarketBreadthProviders(): readonly string[] {
  return [...REGISTRY.keys()];
}

export function _resetMarketBreadthProviders(): void {
  REGISTRY.clear();
}
