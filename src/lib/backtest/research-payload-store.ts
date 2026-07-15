// Phase 21.6 · Stage 4 — Client-only immutable research payload store.
//
// Owned by the SMC / Hybrid backtest panels. Publishes exactly once per
// successful (data-quality validated) run. ResearchPanel subscribes to
// receive the current payload without re-fetching provider data or
// re-running data quality. No server persistence, no candle mutation.

import { useEffect, useSyncExternalStore } from "react";
import type { ResearchDataContext } from "./research-payload";
import { assertFrozenPayload } from "./research-payload";

export type ResearchPayloadStrategy = "SMC_V1" | "ASTRO_SMC_HYBRID_V1";

export type PublishedResearchPayload = ResearchDataContext & {
  readonly strategy: ResearchPayloadStrategy;
  readonly formulaVersion: string;
  readonly publishedAt: string;
  /** Optional astro-per-date map for hybrid runs. Frozen when present. */
  readonly astroByDate?: Readonly<
    Record<string, { direction: "BUY" | "SELL" | "WAIT"; confidence: number }>
  >;
};

type Listener = () => void;

let current: PublishedResearchPayload | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of Array.from(listeners)) l();
}

/**
 * Publish an immutable payload. Callers should pass frozen candles.
 * Idempotent: skips publish when the new payload has the same dataHash +
 * baseRunId + strategy as the current one.
 */
export function publishResearchPayload(payload: PublishedResearchPayload): void {
  const check = assertFrozenPayload(payload);
  const next: PublishedResearchPayload = Object.freeze({
    ...payload,
    candles: check.frozen ? payload.candles : Object.freeze([...payload.candles]),
    astroByDate: payload.astroByDate ? Object.freeze({ ...payload.astroByDate }) : undefined,
  });
  if (
    current &&
    current.dataHash === next.dataHash &&
    current.baseRunId === next.baseRunId &&
    current.strategy === next.strategy
  ) {
    current = next;
    return;
  }
  current = next;
  emit();
}

export function getResearchPayload(): PublishedResearchPayload | null {
  return current;
}

export function clearResearchPayload(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeResearchPayload(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React hook that returns the current published payload (SSR-safe). */
export function useResearchPayload(): PublishedResearchPayload | null {
  return useSyncExternalStore(
    subscribeResearchPayload,
    getResearchPayload,
    () => null,
  );
}

/** Convenience hook used only inside SMC / Hybrid panels to publish on mount+deps. */
export function usePublishResearchPayload(
  build: () => PublishedResearchPayload | null,
  deps: readonly unknown[],
): void {
  useEffect(() => {
    const p = build();
    if (p) publishResearchPayload(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const RESEARCH_PAYLOAD_STORE_MARKER = "RESEARCH_PAYLOAD_STORE_V1";

/** Test-only helper — never called by production UI. */
export function __resetResearchPayloadStoreForTests(): void {
  current = null;
  listeners.clear();
}