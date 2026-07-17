// Phase 31 (Decision wiring) · Server-only Upstox chain fetcher for the
// Decision Intelligence Engine.
//
// Fetches a single live Upstox snapshot for the given underlying, adapts
// it to the legacy shape the Decision engine already consumes, and reports
// an explicit ModuleCapability + explainer.
//
// This helper is intentionally server-only: it constructs the
// UpstoxOptionChainProvider directly (no auth middleware), matching the
// existing pattern in `combined-pcr.functions.ts` / `gti-summary.functions.ts`.

import type { OptionUnderlying } from "../option-chain/types";
import { UpstoxOptionChainProvider } from "../option-chain/upstox-provider.server";
import { adaptUpstoxToLegacyChain, type LiveChainAdapterResult } from "./live-chain-adapter";

export async function fetchLiveDecisionChain(
  underlying: OptionUnderlying = "NIFTY",
): Promise<LiveChainAdapterResult> {
  const provider = new UpstoxOptionChainProvider();
  const result = await provider.fetchSnapshot({ underlying });
  return adaptUpstoxToLegacyChain(underlying, result);
}