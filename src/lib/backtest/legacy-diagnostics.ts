// Phase 21.3d-parity-β2a · Server-side diagnostic helpers.
//
// The legacy `hashConfig` in backtest-engine.ts elides nested fields inside
// `costs` (LEGACY_HASH_CONFIG_NESTED_KEY_ELISION) — a documented α-parity
// quirk. Fixing it would rotate every historical Run ID, so β2a preserves
// the quirk and only surfaces a non-user-facing diagnostic.
//
// This module MUST remain pure: no fetch, no external imports beyond a
// plain type. It is safe to import from any server-fn handler.

import type { CostModel } from "../backtest-engine";

export const LEGACY_RUN_ID_HASH_QUIRK_CODE =
  "LEGACY_RUN_ID_DOES_NOT_FULLY_ENCODE_NESTED_COSTS" as const;

export function hasNonZeroCosts(costs: CostModel): boolean {
  return (
    (costs.slippagePct ?? 0) > 0 ||
    (costs.brokerageFlat ?? 0) > 0 ||
    (costs.brokeragePct ?? 0) > 0 ||
    (costs.taxesPct ?? 0) > 0
  );
}

/**
 * Emit a server-side console.debug when non-zero costs are supplied so the
 * legacy Run ID nested-cost elision quirk is observable in logs without ever
 * surfacing to end users or altering any envelope, Run ID, or cache key.
 */
export function warnLegacyHashQuirkIfApplicable(costs: CostModel): void {
  if (!hasNonZeroCosts(costs)) return;
  // Intentional console.debug — never console.error / never thrown / never
  // returned to the client. Filtered at the log tier.
  // eslint-disable-next-line no-console
  console.debug(
    `[backtest] ${LEGACY_RUN_ID_HASH_QUIRK_CODE} — nested costs (${JSON.stringify(costs)}) do not fully participate in the legacy Run ID hash. Sign-Degree/Legacy output preserved as-is.`,
  );
}