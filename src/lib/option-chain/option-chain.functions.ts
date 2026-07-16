// Phase 26 · Stage 5 — Server functions for the Option Chain UI.
// Read-only, per-user auth. Never returns tokens or raw upstream bodies.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { OptionUnderlying } from "./types";

export interface GetOptionChainInput {
  readonly underlying: OptionUnderlying;
  readonly expiry?: string;
  readonly useMock?: boolean;
  readonly mockScenario?: string;
}

function validate(input: unknown): GetOptionChainInput {
  const i = (input ?? {}) as Partial<GetOptionChainInput>;
  const u = i.underlying;
  if (u !== "NIFTY" && u !== "BANKNIFTY") throw new Error("unsupported underlying");
  return {
    underlying: u,
    expiry: typeof i.expiry === "string" ? i.expiry : undefined,
    useMock: i.useMock === true,
    mockScenario: typeof i.mockScenario === "string" ? i.mockScenario : undefined,
  };
}

export const getOptionChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const startedAt = new Date().toISOString();
    try {
      const { UpstoxOptionChainProvider } = await import("./upstox-provider.server");
      const { MockOptionChainProvider } = await import("./mock-provider");
      const { assessDataQuality } = await import("./data-quality");
      const { computeAtm } = await import("./atm-engine");
      const { getSnapshotHistory } = await import("./snapshot-history");

      const provider = data.useMock
        ? new MockOptionChainProvider({ scenario: (data.mockScenario as never) ?? "SIDEWAYS" })
        : new UpstoxOptionChainProvider();

      const res = await provider.fetchSnapshot({ underlying: data.underlying, expiry: data.expiry });
      if (!res.ok || !res.snapshot) {
        return {
          ok: false as const,
          snapshot: null,
          quality: null,
          atm: null,
          meta: res.meta,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }
      const quality = assessDataQuality(res.snapshot);
      const atm = computeAtm(res.snapshot.strikes, res.snapshot.spotPrice, "ATM").atm;
      try { getSnapshotHistory().push(res.snapshot); } catch { /* best-effort */ }
      return {
        ok: true as const,
        snapshot: res.snapshot,
        quality,
        atm,
        meta: res.meta,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "option chain failed";
      return {
        ok: false as const,
        snapshot: null,
        quality: null,
        atm: null,
        meta: {
          providerId: "UPSTOX",
          status: "UNAVAILABLE" as const,
          latencyMs: 0,
          fetchedAt: new Date().toISOString(),
          safeError: safe,
          upstreamCode: null,
        },
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  });

export type GetOptionChainResult = Awaited<ReturnType<typeof getOptionChain>>;

export const getOptionChainDiagnostics = createServerFn({ method: "GET" })
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
      const { buildOptionChainDiagnostics } = await import("./option-chain-diagnostics.server");
      const report = await buildOptionChainDiagnostics();
      return { ok: true as const, report, safeError: null, startedAt, completedAt: new Date().toISOString() };
    } catch (e) {
      const safe = e instanceof Error ? e.message.slice(0, 200) : "diagnostics failed";
      return { ok: false as const, report: null, safeError: safe, startedAt, completedAt: new Date().toISOString() };
    }
  });