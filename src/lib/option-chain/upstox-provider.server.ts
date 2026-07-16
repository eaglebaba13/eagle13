// Phase 26 · Stage 5 — Upstox OptionChainProvider adapter.
//
// Server-only. Reads option-chain via Upstox `v2/option/chain`. Never
// exposes tokens. Failures return a safe result with redacted error.
// Does NOT compute Combined PCR; snapshot only.

import { UpstoxHttpClient, redactUpstoxMessage } from "../provider-foundation/upstox/upstox-http.server";
import type { OptionChainProvider, OptionChainRequest, OptionChainResult, OptionChainProviderStatus } from "./provider";
import { makeStrike, type OptionChainSnapshot, type OptionUnderlying } from "./types";

const INSTRUMENT_KEYS: Record<OptionUnderlying, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
};

type UpstoxRow = {
  strike_price?: number;
  expiry?: string;
  underlying_spot_price?: number;
  pcr?: number;
  call_options?: UpstoxLeg;
  put_options?: UpstoxLeg;
};
type UpstoxLeg = {
  market_data?: { oi?: number; prev_oi?: number; volume?: number; ltp?: number; bid_price?: number; ask_price?: number };
  option_greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number; rho?: number; iv?: number };
};

function nOrNull(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function legFromUpstox(leg: UpstoxLeg | undefined) {
  const md = leg?.market_data ?? {};
  const g = leg?.option_greeks ?? {};
  const oi = nOrNull(md.oi);
  const prevOi = nOrNull(md.prev_oi);
  return {
    oi,
    changeOi: oi != null && prevOi != null ? oi - prevOi : null,
    volume: nOrNull(md.volume),
    iv: nOrNull(g.iv),
    ltp: nOrNull(md.ltp),
    bid: nOrNull(md.bid_price),
    ask: nOrNull(md.ask_price),
    greeks: {
      delta: nOrNull(g.delta),
      gamma: nOrNull(g.gamma),
      theta: nOrNull(g.theta),
      vega: nOrNull(g.vega),
      rho: nOrNull(g.rho),
    },
  };
}

export class UpstoxOptionChainProvider implements OptionChainProvider {
  public readonly id = "UPSTOX";
  private readonly http: UpstoxHttpClient;

  constructor(http?: UpstoxHttpClient) {
    this.http = http ?? new UpstoxHttpClient();
  }

  async listExpiries(underlying: OptionUnderlying): Promise<readonly string[]> {
    const res = await this.http.request<{ data?: { expiries?: string[] } }>({
      path: "v2/option/contract",
      query: { instrument_key: INSTRUMENT_KEYS[underlying] },
    });
    if (!res.ok) return [];
    const list = res.data?.data?.expiries;
    if (!Array.isArray(list)) return [];
    return list.filter((e): e is string => typeof e === "string");
  }

  async fetchSnapshot(req: OptionChainRequest): Promise<OptionChainResult> {
    const query: Record<string, string | number | undefined> = {
      instrument_key: INSTRUMENT_KEYS[req.underlying],
    };
    if (req.expiry) query.expiry_date = req.expiry;
    const t0 = Date.now();
    const res = await this.http.request<{ data?: UpstoxRow[] }>({
      path: "v2/option/chain",
      query,
      requestId: req.requestId,
    });
    const fetchedAt = new Date().toISOString();
    if (!res.ok) {
      const status: OptionChainProviderStatus =
        res.error.httpStatus === 401 || res.error.httpStatus === 403 ? "AUTH_REQUIRED" : "UNAVAILABLE";
      return {
        ok: false,
        snapshot: null,
        meta: {
          providerId: this.id,
          status,
          latencyMs: Date.now() - t0,
          fetchedAt,
          safeError: redactUpstoxMessage(res.error.message ?? ""),
          upstreamCode: res.error.upstoxErrorCode ?? null,
        },
      };
    }
    const rows = Array.isArray(res.data?.data) ? res.data!.data! : [];
    if (rows.length === 0) {
      return {
        ok: false,
        snapshot: null,
        meta: {
          providerId: this.id,
          status: "UNAVAILABLE",
          latencyMs: res.latencyMs,
          fetchedAt,
          safeError: "empty option chain",
          upstreamCode: null,
        },
      };
    }
    const first = rows[0];
    const expiry = req.expiry ?? (first.expiry ?? "");
    const spot = nOrNull(first.underlying_spot_price);
    const seen = new Map<number, ReturnType<typeof makeStrike>>();
    for (const r of rows) {
      const strike = nOrNull(r.strike_price);
      if (strike == null) continue;
      seen.set(strike, makeStrike(strike, legFromUpstox(r.call_options), legFromUpstox(r.put_options)));
    }
    const strikes = [...seen.values()].sort((a, b) => a.strike - b.strike);
    const snap: OptionChainSnapshot = {
      instrument: req.underlying,
      spotPrice: spot,
      timestamp: fetchedAt,
      provider: this.id,
      expiry,
      availableExpiries: [],
      marketSession: "UNKNOWN",
      dataQuality: strikes.length >= 5 ? "OK" : "PARTIAL",
      strikes,
    };
    return {
      ok: true,
      snapshot: snap,
      meta: {
        providerId: this.id,
        status: "LIVE",
        latencyMs: res.latencyMs,
        fetchedAt,
        safeError: null,
        upstreamCode: null,
      },
    };
  }
}