// Phase 27 · Stage 1 — Combined PCR server function.
//
// Consumes the Option Chain Foundation: fetches per-instrument snapshots
// through the existing OptionChainProvider registry (Upstox / Mock),
// pushes into snapshot history, then computes a research reading.
// No broker, no execution, no changes to existing cache keys.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OptionUnderlying, OptionChainSnapshot } from "../option-chain/types";
import type { AtmMode } from "../option-chain/atm-engine";
import { computeCombinedPcr } from "./combined-pcr";
import type { CombinedPcrWeights } from "./types";
import { DEFAULT_COMBINED_PCR_WEIGHTS } from "./types";

const UNDERLYINGS: readonly OptionUnderlying[] = ["NIFTY", "BANKNIFTY"];

export interface GetCombinedPcrInput {
  readonly useMock?: boolean;
  readonly mockScenario?: string;
  readonly atmMode?: AtmMode;
  readonly atmCustom?: number;
  readonly weights?: CombinedPcrWeights;
  readonly expiries?: Partial<Record<OptionUnderlying, string>>;
  readonly previousPending?: string;
  readonly previousConfirmed?: string;
  readonly previousCount?: number;
  readonly runId?: string;
}

function validate(input: unknown): GetCombinedPcrInput {
  const i = (input ?? {}) as Partial<GetCombinedPcrInput>;
  return {
    useMock: i.useMock === true,
    mockScenario: typeof i.mockScenario === "string" ? i.mockScenario : undefined,
    atmMode: (i.atmMode as AtmMode | undefined) ?? "ATM_10",
    atmCustom: typeof i.atmCustom === "number" ? i.atmCustom : undefined,
    weights: i.weights,
    expiries: i.expiries,
    previousPending: typeof i.previousPending === "string" ? i.previousPending : undefined,
    previousConfirmed: typeof i.previousConfirmed === "string" ? i.previousConfirmed : undefined,
    previousCount: typeof i.previousCount === "number" ? i.previousCount : undefined,
    runId: typeof i.runId === "string" ? i.runId : undefined,
  };
}

function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `pcr-${Date.now().toString(36)}-${rand}`;
}

export const getCombinedPcr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const startedAt = new Date().toISOString();
    try {
      const { UpstoxOptionChainProvider } = await import("../option-chain/upstox-provider.server");
      const { MockOptionChainProvider } = await import("../option-chain/mock-provider");
      const { getSnapshotHistory } = await import("../option-chain/snapshot-history");

      const provider = data.useMock
        ? new MockOptionChainProvider({ scenario: (data.mockScenario as never) ?? "SIDEWAYS" })
        : new UpstoxOptionChainProvider();

      const snapshots: Partial<Record<OptionUnderlying, OptionChainSnapshot | null>> = {};
      const providerMeta: Record<string, {
        providerId: string;
        status: string;
        latencyMs: number;
        fetchedAt: string;
        safeError: string | null;
        upstreamCode: string | null;
      }> = {};
      const history = getSnapshotHistory();

      for (const u of UNDERLYINGS) {
        const expiry = data.expiries?.[u];
        const res = await provider.fetchSnapshot({ underlying: u, expiry });
        providerMeta[u] = {
          providerId: res.meta.providerId,
          status: res.meta.status,
          latencyMs: res.meta.latencyMs,
          fetchedAt: res.meta.fetchedAt,
          safeError: res.meta.safeError,
          upstreamCode: res.meta.upstreamCode,
        };
        if (res.ok && res.snapshot) {
          snapshots[u] = res.snapshot;
          try { history.push(res.snapshot); } catch { /* best-effort */ }
        } else {
          snapshots[u] = null;
        }
      }

      const previousConfirmation = data.previousConfirmed || data.previousPending
        ? {
            confirmed: (data.previousConfirmed as never) ?? "NO_TRADE",
            pending: (data.previousPending as never) ?? (data.previousConfirmed as never) ?? "NO_TRADE",
            count: Math.max(1, data.previousCount ?? 1),
          }
        : undefined;

      const weights = data.weights ?? DEFAULT_COMBINED_PCR_WEIGHTS;
      const reading = computeCombinedPcr({
        snapshots,
        weights,
        atmMode: data.atmMode,
        atmCustom: data.atmCustom,
        history,
        previousConfirmation,
        runId: data.runId ?? newRunId(),
      });

      return {
        ok: true as const,
        reading,
        providerMeta,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "combined-pcr failed";
      return {
        ok: false as const,
        reading: null,
        providerMeta: {},
        safeError: safe,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  });

export type GetCombinedPcrResult = Awaited<ReturnType<typeof getCombinedPcr>>;

export const getCombinedPcrDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const startedAt = new Date().toISOString();
    try {
      let isAdmin = false;
      try {
        const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
        isAdmin = data === true;
      } catch { isAdmin = false; }
      if (!isAdmin) {
        return { ok: false as const, report: null, safeError: "admin required", startedAt, completedAt: new Date().toISOString() };
      }
      const { buildCombinedPcrDiagnostics } = await import("./combined-pcr-diagnostics.server");
      const report = await buildCombinedPcrDiagnostics();
      return { ok: true as const, report, safeError: null, startedAt, completedAt: new Date().toISOString() };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "diagnostics failed";
      return { ok: false as const, report: null, safeError: safe, startedAt, completedAt: new Date().toISOString() };
    }
  });