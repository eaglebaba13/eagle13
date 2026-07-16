// Phase 26 · Stage 5 — Deterministic mock OptionChainProvider.
//
// Scenarios: BULLISH / BEARISH / SIDEWAYS / MISSING_EXPIRY /
// MISSING_STRIKES / STALE / PROVIDER_FAILURE / PAUSED. No I/O.

import type { OptionChainProvider, OptionChainRequest, OptionChainResult } from "./provider";
import { makeStrike, type OptionChainSnapshot, type OptionUnderlying } from "./types";

export type MockScenario =
  | "BULLISH"
  | "BEARISH"
  | "SIDEWAYS"
  | "MISSING_EXPIRY"
  | "MISSING_STRIKES"
  | "STALE"
  | "PROVIDER_FAILURE"
  | "PAUSED";

const SPOTS: Record<OptionUnderlying, number> = { NIFTY: 24_500, BANKNIFTY: 52_000 };
const STEP: Record<OptionUnderlying, number> = { NIFTY: 50, BANKNIFTY: 100 };

function isoDaysFromNow(days: number, nowMs: number): string {
  const d = new Date(nowMs + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function buildStrikes(u: OptionUnderlying, spot: number, scenario: MockScenario, count = 21) {
  const step = STEP[u];
  const half = Math.floor(count / 2);
  const out = [] as ReturnType<typeof makeStrike>[];
  for (let i = -half; i <= half; i += 1) {
    const strike = Math.round(spot / step) * step + i * step;
    const bias = scenario === "BULLISH" ? 1.3 : scenario === "BEARISH" ? 0.7 : 1;
    const callOi = Math.max(0, Math.round((1000 - i * 50) * (scenario === "BEARISH" ? 1.3 : 1)));
    const putOi = Math.max(0, Math.round((1000 + i * 50) * (scenario === "BULLISH" ? 1.3 : 1)));
    if (scenario === "MISSING_STRIKES" && i % 3 === 0) continue;
    out.push(makeStrike(strike,
      { oi: callOi, changeOi: Math.round(callOi * 0.05 * bias), volume: callOi * 3, iv: 15 + Math.abs(i) * 0.3, ltp: Math.max(1, 200 - i * 8) },
      { oi: putOi, changeOi: Math.round(putOi * 0.05 / bias), volume: putOi * 3, iv: 15 + Math.abs(i) * 0.3, ltp: Math.max(1, 200 + i * 8) },
    ));
  }
  return out;
}

export interface MockProviderOptions {
  readonly scenario?: MockScenario;
  readonly nowIso?: string;
  readonly paused?: boolean;
}

export class MockOptionChainProvider implements OptionChainProvider {
  public readonly id = "MOCK";
  private scenario: MockScenario;
  private paused: boolean;
  private now: () => string;

  constructor(opts: MockProviderOptions = {}) {
    this.scenario = opts.scenario ?? "SIDEWAYS";
    this.paused = opts.paused ?? false;
    this.now = () => opts.nowIso ?? new Date().toISOString();
  }

  setScenario(s: MockScenario): void { this.scenario = s; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  getScenario(): MockScenario { return this.scenario; }

  async listExpiries(): Promise<readonly string[]> {
    if (this.scenario === "MISSING_EXPIRY") return [];
    const now = Date.parse(this.now());
    return [isoDaysFromNow(3, now), isoDaysFromNow(10, now), isoDaysFromNow(24, now)];
  }

  async fetchSnapshot(req: OptionChainRequest): Promise<OptionChainResult> {
    const nowIso = this.now();
    if (this.paused || this.scenario === "PROVIDER_FAILURE") {
      return {
        ok: false,
        snapshot: null,
        meta: {
          providerId: this.id,
          status: this.paused ? "UNAVAILABLE" : "UNAVAILABLE",
          latencyMs: 0,
          fetchedAt: nowIso,
          safeError: this.paused ? "provider paused" : "mock failure",
          upstreamCode: null,
        },
      };
    }
    if (this.scenario === "MISSING_EXPIRY") {
      return {
        ok: false, snapshot: null,
        meta: { providerId: this.id, status: "UNAVAILABLE", latencyMs: 0, fetchedAt: nowIso, safeError: "no expiries", upstreamCode: null },
      };
    }
    const expiries = await this.listExpiries();
    const expiry = req.expiry ?? expiries[0]!;
    const spot = SPOTS[req.underlying];
    const strikes = buildStrikes(req.underlying, spot, this.scenario);
    const staleIso = this.scenario === "STALE"
      ? new Date(Date.parse(nowIso) - 20 * 60 * 1000).toISOString()
      : nowIso;
    const snap: OptionChainSnapshot = {
      instrument: req.underlying,
      spotPrice: spot,
      timestamp: staleIso,
      provider: this.id,
      expiry,
      availableExpiries: expiries,
      marketSession: "OPEN",
      dataQuality: this.scenario === "STALE" ? "STALE" : "OK",
      strikes,
    };
    return {
      ok: true,
      snapshot: snap,
      meta: {
        providerId: this.id,
        status: this.scenario === "STALE" ? "STALE" : "LIVE",
        latencyMs: 1,
        fetchedAt: nowIso,
        safeError: null,
        upstreamCode: null,
      },
    };
  }
}