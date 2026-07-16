// Phase 27 · Stage 3 — Market Breadth / GTI server function.
//
// Consumes the existing Combined PCR server function output (via direct
// helper import) for the PCR confirmation, but the breadth itself flows
// from a provider-neutral bundle. When no live breadth provider is
// wired, the deterministic mock provider fills the bundle so the
// research page is always testable — never labelled live.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildMockBreadthBundle, type MockScenario } from "./mock-provider";
import { evaluateVixRegime } from "./vix-regime";
import { adaptPcrConfirmation } from "./pcr-confirmation";
import { classifyGti } from "./gti-classifier";
import type { CombinedPcrReading } from "../combined-pcr/types";

export interface GetMarketBreadthInput {
  readonly mockScenario?: MockScenario;
  readonly vix?: number | null;
  readonly previousVix?: number | null;
  readonly pcr?: CombinedPcrReading | null;
  readonly broadUniverseSize?: number;
  readonly runId?: string;
}

function validate(input: unknown): GetMarketBreadthInput {
  const i = (input ?? {}) as Partial<GetMarketBreadthInput>;
  return {
    mockScenario: (i.mockScenario as MockScenario | undefined) ?? "MIXED",
    vix: typeof i.vix === "number" ? i.vix : null,
    previousVix: typeof i.previousVix === "number" ? i.previousVix : null,
    pcr: (i.pcr as CombinedPcrReading | null | undefined) ?? null,
    broadUniverseSize: typeof i.broadUniverseSize === "number" ? i.broadUniverseSize : undefined,
    runId: typeof i.runId === "string" ? i.runId : undefined,
  };
}

function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `gti-${Date.now().toString(36)}-${rand}`;
}

export const getMarketBreadth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const startedAt = new Date().toISOString();
    try {
      const bundle = buildMockBreadthBundle({
        scenario: data.mockScenario ?? "MIXED",
        broadUniverseSize: data.broadUniverseSize,
      });
      const vix = evaluateVixRegime({
        currentVix: data.vix ?? null,
        previousVix: data.previousVix ?? null,
        provider: data.vix != null ? "UPSTOX" : "N/A",
        timestamp: new Date().toISOString(),
        freshness: data.vix != null ? "FRESH" : "UNKNOWN",
      });
      const pcr = adaptPcrConfirmation({ reading: data.pcr ?? null });
      const reading = classifyGti({
        broad: bundle.broad,
        nifty50: bundle.nifty50,
        topWeighted: bundle.topWeighted,
        banking: bundle.banking,
        it: bundle.it,
        oilGas: bundle.oilGas,
        auto: bundle.auto,
        pcr,
        vix,
        runId: data.runId ?? newRunId(),
      });
      return {
        ok: true as const,
        reading,
        providerId: "MOCK_BREADTH",
        safeError: null as string | null,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "market-breadth failed";
      return {
        ok: false as const,
        reading: null,
        providerId: "N/A",
        safeError: safe,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  });

export type GetMarketBreadthResult = Awaited<ReturnType<typeof getMarketBreadth>>;

export const getMarketBreadthDiagnostics = createServerFn({ method: "GET" })
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
      const { buildMarketBreadthDiagnostics } = await import("./diagnostics.server");
      const report = await buildMarketBreadthDiagnostics();
      return { ok: true as const, report, safeError: null, startedAt, completedAt: new Date().toISOString() };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "diagnostics failed";
      return { ok: false as const, report: null, safeError: safe, startedAt, completedAt: new Date().toISOString() };
    }
  });
