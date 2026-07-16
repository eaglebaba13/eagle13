// Phase 26 · Stage 5 — Provider-neutral OptionChainProvider interface.
//
// No broker/execution logic — read-only market data only. Broker-specific
// wiring lives in adapters (upstox-provider.server.ts, mock-provider.ts,
// future indstocks/shoonya/angel/nuvama). This interface must remain
// stable across providers.

import type { OptionChainSnapshot, OptionUnderlying } from "./types";

export interface OptionChainRequest {
  readonly underlying: OptionUnderlying;
  /** Optional — provider picks the current weekly when omitted. */
  readonly expiry?: string;
  /** Optional client-supplied correlation id for logging. */
  readonly requestId?: string;
}

export type OptionChainProviderStatus =
  | "LIVE"
  | "DELAYED"
  | "STALE"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE";

export interface OptionChainProviderMeta {
  readonly providerId: string;
  readonly status: OptionChainProviderStatus;
  readonly latencyMs: number;
  readonly fetchedAt: string;
  /** Redacted upstream error message; never contains tokens. */
  readonly safeError: string | null;
  readonly upstreamCode: string | null;
}

export interface OptionChainResult {
  readonly ok: boolean;
  readonly snapshot: OptionChainSnapshot | null;
  readonly meta: OptionChainProviderMeta;
}

export interface OptionChainProvider {
  readonly id: string;
  fetchSnapshot(req: OptionChainRequest): Promise<OptionChainResult>;
  listExpiries?(underlying: OptionUnderlying): Promise<readonly string[]>;
}

/** In-memory provider registry. No broker imports. */
const REGISTRY = new Map<string, OptionChainProvider>();

export function registerOptionChainProvider(p: OptionChainProvider): void {
  REGISTRY.set(p.id, p);
}

export function getOptionChainProvider(id: string): OptionChainProvider | null {
  return REGISTRY.get(id) ?? null;
}

export function listOptionChainProviders(): readonly string[] {
  return [...REGISTRY.keys()];
}

/** Test-only reset. */
export function _resetOptionChainProviders(): void {
  REGISTRY.clear();
}