// Phase 2C — Canonical option-chain snapshot helper (SERVER-ONLY).
//
// Single source of truth for fetching an option-chain snapshot on the
// server. `getOptionChain` and `getCombinedPcr` BOTH call this helper —
// Combined PCR must NEVER perform an independent provider fetch. The
// helper also produces the canonical `OptionChainCapability` alongside
// the snapshot so downstream consumers can gate work on capability
// without re-fetching or duplicating logic.

import type { OptionChainSnapshot, OptionUnderlying } from "./types";
import type { OptionChainProviderMeta } from "./provider";
import type { QualityReport } from "./data-quality";
import type { OptionChainCapability } from "./capability";
import { evaluateOptionChainCapability } from "./capability";

export interface CanonicalSnapshotInput {
  readonly underlying: OptionUnderlying;
  readonly expiry?: string;
  readonly useMock?: boolean;
  readonly mockScenario?: string;
}

export interface CanonicalSnapshotResult {
  readonly ok: boolean;
  readonly snapshot: OptionChainSnapshot | null;
  readonly quality: QualityReport | null;
  readonly atm: number | null;
  readonly meta: OptionChainProviderMeta;
  readonly capability: OptionChainCapability;
}

export async function fetchCanonicalOptionChain(
  input: CanonicalSnapshotInput,
): Promise<CanonicalSnapshotResult> {
  const { UpstoxOptionChainProvider } = await import("./upstox-provider.server");
  const { MockOptionChainProvider } = await import("./mock-provider");
  const { assessDataQuality } = await import("./data-quality");
  const { computeAtm } = await import("./atm-engine");
  const { getSnapshotHistory } = await import("./snapshot-history");

  const provider = input.useMock
    ? new MockOptionChainProvider({ scenario: (input.mockScenario as never) ?? "SIDEWAYS" })
    : new UpstoxOptionChainProvider();

  const res = await provider.fetchSnapshot({ underlying: input.underlying, expiry: input.expiry });
  const now = new Date().toISOString();

  if (!res.ok || !res.snapshot) {
    const capability = evaluateOptionChainCapability({
      underlying: input.underlying,
      requestedExpiry: input.expiry ?? null,
      ok: false,
      snapshot: null,
      quality: null,
      meta: res.meta,
      nowIso: now,
    });
    return { ok: false, snapshot: null, quality: null, atm: null, meta: res.meta, capability };
  }

  const quality = assessDataQuality(res.snapshot);
  const atm = computeAtm(res.snapshot.strikes, res.snapshot.spotPrice, "ATM").atm;
  try { getSnapshotHistory().push(res.snapshot); } catch { /* best-effort */ }

  const capability = evaluateOptionChainCapability({
    underlying: input.underlying,
    requestedExpiry: input.expiry ?? null,
    ok: true,
    snapshot: res.snapshot,
    quality,
    meta: res.meta,
    nowIso: now,
  });

  return { ok: true, snapshot: res.snapshot, quality, atm, meta: res.meta, capability };
}