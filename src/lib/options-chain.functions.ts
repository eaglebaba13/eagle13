// Server function that fetches a live NIFTY / BANK NIFTY option-chain
// snapshot, validates the provider payload with Zod, categorises expiries,
// and normalises the result for the Options Analytics Terminal.
//
// Phase 16.1 — Data-integrity hardening:
//   * Live mode NEVER auto-substitutes simulated data. If the upstream feed
//     fails and no last-known-good cache is available, the response carries
//     sourceStatus = "UNAVAILABLE" and empty legs so the UI can render its
//     safe empty state and disable analytics + recommendations.
//   * Simulated chains are produced ONLY when the caller explicitly opts in
//     via `demo: true`, and are tagged sourceStatus = "DEMO".
//   * A short-lived last-known-good (LKG) cache serves the previous valid
//     snapshot when the live provider errors, tagged sourceStatus = "STALE"
//     when past the delayed threshold — never labelled LIVE.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchJson } from "./http";
import { cached } from "./server-cache";
import { YahooChartSchema, parseProvider } from "./providers";
import type {
  OptionChainSnapshot,
  OptionLeg,
} from "./options-analytics";
import { categorizeExpiries, type ExpiryCategory } from "./options-analytics";
import {
  FRESHNESS_THRESHOLDS,
  classifyFreshness,
  atmCoverage,
  type SourceStatus,
  type OptionsIntegrityMeta,
} from "./options-integrity";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/";

/* ---------------- NSE rich option-chain schema ---------------- */
// Passthrough tolerates provider drift; only fields actually read here are
// validated. Existing NseOptionChainSchema in providers.ts is left untouched.
const RichLeg = z
  .object({
    strikePrice: z.number().optional(),
    expiryDate: z.string().optional(),
    openInterest: z.number().optional(),
    changeinOpenInterest: z.number().optional(),
    totalTradedVolume: z.number().optional(),
    impliedVolatility: z.number().optional(),
    lastPrice: z.number().optional(),
    change: z.number().optional(),
    pChange: z.number().optional(),
    bidprice: z.number().optional(),
    askPrice: z.number().optional(),
  })
  .passthrough();

const NseFullChain = z.object({
  records: z
    .object({
      expiryDates: z.array(z.string()).optional(),
      underlyingValue: z.number().optional(),
      data: z
        .array(
          z
            .object({
              strikePrice: z.number().optional(),
              expiryDate: z.string().optional(),
              CE: RichLeg.optional(),
              PE: RichLeg.optional(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough()
    .optional(),
});

/* -------------------------- input ---------------------------- */

const SYMBOLS = { NIFTY: "^NSEI", BANKNIFTY: "^NSEBANK" } as const;
const NSE_SYMBOLS = { NIFTY: "NIFTY", BANKNIFTY: "BANKNIFTY" } as const;
const STEPS = { NIFTY: 50, BANKNIFTY: 100 } as const;

export type OptionsSymbol = keyof typeof SYMBOLS;

export type ExpirySummary = {
  expiry: string;
  category: ExpiryCategory;
  daysToExpiry: number;
};

export type OptionsChainResponse = {
  snapshot: OptionChainSnapshot;
  expiries: ExpirySummary[];
  selectedExpiry: string;
  step: number;
  degraded: boolean;
  errorMessage: string | null;
  integrity: OptionsIntegrityMeta;
  yahooSpot: number | null;
};

/* -------------------------- helpers -------------------------- */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchSpot(sym: OptionsSymbol): Promise<{ price: number; prevClose: number }> {
  const url = `${YAHOO}${encodeURIComponent(SYMBOLS[sym])}?interval=1d&range=5d`;
  const json = parseProvider(YahooChartSchema, await fetchJson<unknown>(url), `Yahoo (${sym})`);
  const result = json.chart.result?.[0];
  const meta = result?.meta;
  const q = result?.indicators?.quote?.[0];
  const closes = (q?.close ?? []).filter((c): c is number => c != null);
  const price = round2(meta?.regularMarketPrice ?? closes[closes.length - 1] ?? 0);
  const prev = round2(
    meta?.chartPreviousClose ?? meta?.previousClose ?? closes[closes.length - 2] ?? price,
  );
  if (!price) throw new Error(`No spot for ${sym}`);
  return { price, prevClose: prev };
}

async function fetchSpotSafe(sym: OptionsSymbol): Promise<{ price: number | null; prevClose: number | null }> {
  try {
    return await fetchSpot(sym);
  } catch {
    return { price: null, prevClose: null };
  }
}

function toIsoDate(nseExpiry: string): string {
  // NSE returns "17-Jul-2026". Convert to "2026-07-17".
  const parts = nseExpiry.split("-");
  if (parts.length !== 3) return nseExpiry;
  const [d, mon, y] = parts;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = months.indexOf(mon);
  if (m < 0) return nseExpiry;
  return `${y}-${String(m + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/* ------------------- Last-known-good (LKG) cache ------------------- */
// Module-level cache of the most recent successful LIVE snapshot per
// (symbol, expiry). Persists for the lifetime of the server isolate.

type LkgEntry = {
  snapshot: OptionChainSnapshot;
  expiries: ExpirySummary[];
  yahooSpot: number | null;
  tradingDate: string;
  fetchedAtMs: number;
};
const LKG = new Map<string, LkgEntry>();
function lkgKey(sym: OptionsSymbol, expiry: string): string {
  return `${sym}::${expiry}`;
}
function currentTradingDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/* --------------------- SIMULATED fallback -------------------- */

function buildSimulatedChain(
  sym: OptionsSymbol,
  spot: number,
): { legs: OptionLeg[]; strikes: number[] } {
  const step = STEPS[sym];
  const atm = Math.round(spot / step) * step;
  const half = 10;
  const strikes: number[] = [];
  for (let i = -half; i <= half; i++) strikes.push(atm + i * step);
  const legs: OptionLeg[] = [];
  for (const k of strikes) {
    const dist = (k - atm) / step;
    // Deterministic OI curve, peaked away from ATM by ~3 strikes.
    const callOi = Math.round(1_000_000 * Math.exp(-Math.pow(dist - 3, 2) / 20));
    const putOi = Math.round(1_000_000 * Math.exp(-Math.pow(dist + 3, 2) / 20));
    const callVol = Math.round(callOi * 0.4);
    const putVol = Math.round(putOi * 0.4);
    legs.push({
      strike: k,
      side: "CE",
      oi: callOi,
      changeOi: Math.round(callOi * (dist > 0 ? 0.12 : -0.05)),
      volume: callVol,
      ltp: round2(Math.max(1, spot - k) + 40 * Math.exp(-Math.abs(dist) / 5)),
      changePct: 0,
      iv: null,
      bid: null,
      ask: null,
    });
    legs.push({
      strike: k,
      side: "PE",
      oi: putOi,
      changeOi: Math.round(putOi * (dist < 0 ? 0.12 : -0.05)),
      volume: putVol,
      ltp: round2(Math.max(1, k - spot) + 40 * Math.exp(-Math.abs(dist) / 5)),
      changePct: 0,
      iv: null,
      bid: null,
      ask: null,
    });
  }
  return { legs, strikes };
}

function simulatedExpiries(now: Date = new Date()): string[] {
  // Generate the next 4 Thursday expiries.
  const out: string[] = [];
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  while (out.length < 4) {
    if (d.getDay() === 4 && d.getTime() >= now.getTime()) {
      out.push(d.toISOString().slice(0, 10));
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/* ------------------------- Integrity helpers ------------------------- */

function computeIntegrity(
  snapshot: OptionChainSnapshot,
  opts: {
    demo: boolean;
    minCoverage: number;
    fromLkg: boolean;
    lastLiveFetchAt: string | null;
    yahooSpot: number | null;
  },
): OptionsIntegrityMeta {
  const receivedAt = new Date().toISOString();
  const ageSec = Math.max(
    0,
    Math.round((Date.now() - new Date(snapshot.fetchedAt).getTime()) / 1000),
  );
  const strikeCount = snapshot.strikes.length;
  const missing = snapshot.legs.filter((l) => !Number.isFinite(l.oi)).length;
  const validStrikes = snapshot.strikes.length; // placeholder — refined below
  const hasCall = snapshot.legs.some((l) => l.side === "CE");
  const hasPut = snapshot.legs.some((l) => l.side === "PE");
  const atm =
    snapshot.strikes.length && snapshot.spot
      ? snapshot.strikes.reduce((b, s) =>
          Math.abs(s - snapshot.spot) < Math.abs(b - snapshot.spot) ? s : b,
        )
      : 0;
  const cov = atmCoverage(snapshot.strikes, atm);
  const partial =
    !hasCall || !hasPut || cov.below < opts.minCoverage || cov.above < opts.minCoverage;

  let sourceStatus: SourceStatus;
  let cacheStatus: OptionsIntegrityMeta["cacheStatus"];
  if (opts.demo || snapshot.source === "DEMO" || snapshot.source === "SIMULATED") {
    sourceStatus = "DEMO";
    cacheStatus = "DEMO";
  } else if (snapshot.source === "UNAVAILABLE" || strikeCount === 0) {
    sourceStatus = "UNAVAILABLE";
    cacheStatus = "NONE";
  } else if (partial) {
    sourceStatus = "PARTIAL";
    cacheStatus = opts.fromLkg ? "LAST_KNOWN_GOOD" : "LIVE";
  } else {
    const freshness = classifyFreshness(ageSec);
    if (freshness === "STALE") sourceStatus = "STALE";
    else if (freshness === "DELAYED" || opts.fromLkg) sourceStatus = "DELAYED";
    else sourceStatus = "LIVE";
    cacheStatus = opts.fromLkg ? "LAST_KNOWN_GOOD" : "LIVE";
  }

  const providerTs = snapshot.fetchedAt;
  const isTradable =
    sourceStatus === "LIVE" &&
    hasCall &&
    hasPut &&
    cov.below >= opts.minCoverage &&
    cov.above >= opts.minCoverage &&
    snapshot.spot > 0;

  const spotDivergence =
    opts.yahooSpot != null && snapshot.spot > 0
      ? Math.abs(snapshot.spot - opts.yahooSpot)
      : null;

  return {
    sourceStatus,
    provider: snapshot.provider,
    fetchedAt: snapshot.fetchedAt,
    providerTimestamp: providerTs,
    receivedAt,
    dataAgeSeconds: ageSec,
    expiry: snapshot.expiry || null,
    underlying: snapshot.spot || null,
    strikeCount,
    validStrikeCount: validStrikes - missing,
    missingFieldCount: missing,
    isTradable,
    lastLiveFetchAt: opts.lastLiveFetchAt,
    cacheStatus,
    spotDivergence,
  };
}

function emptyUnavailableResponse(
  sym: OptionsSymbol,
  expiryHint: string | undefined,
  step: number,
  yahooSpot: number | null,
  errorMessage: string,
): OptionsChainResponse {
  const iso = simulatedExpiries();
  const expiries = categorizeExpiries(iso);
  const selectedExpiry = expiryHint && iso.includes(expiryHint) ? expiryHint : iso[0];
  const snapshot: OptionChainSnapshot = {
    symbol: sym,
    spot: yahooSpot ?? 0,
    expiry: selectedExpiry,
    fetchedAt: new Date().toISOString(),
    strikes: [],
    legs: [],
    provider: "unavailable",
    source: "UNAVAILABLE",
  };
  const integrity = computeIntegrity(snapshot, {
    demo: false,
    minCoverage: 5,
    fromLkg: false,
    lastLiveFetchAt: null,
    yahooSpot,
  });
  return {
    snapshot,
    expiries,
    selectedExpiry,
    step,
    degraded: true,
    errorMessage,
    integrity,
    yahooSpot,
  };
}

/* ------------------------- server fn ------------------------- */

export const getOptionsChain = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        symbol: z.enum(["NIFTY", "BANKNIFTY"]).default("NIFTY"),
        expiry: z.string().optional(),
        demo: z.boolean().optional().default(false),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }): Promise<OptionsChainResponse> => {
    const sym: OptionsSymbol = data.symbol;
    const step = STEPS[sym];
    const mode = data.demo ? "demo" : "live";
    return cached<OptionsChainResponse>(
      `options-chain:${mode}:${sym}:${data.expiry ?? "auto"}`,
      async () => {
        const spotInfo = await fetchSpotSafe(sym);
        const yahooSpot = spotInfo.price;

        /* ------------------------ DEMO MODE ------------------------ */
        if (data.demo) {
          const iso = simulatedExpiries();
          const expiries = categorizeExpiries(iso);
          const selectedIso = data.expiry && iso.includes(data.expiry) ? data.expiry : iso[0];
          const demoSpot = yahooSpot ?? (sym === "NIFTY" ? 24000 : 51000);
          const { legs, strikes } = buildSimulatedChain(sym, demoSpot);
          const snapshot: OptionChainSnapshot = {
            symbol: sym,
            spot: demoSpot,
            expiry: selectedIso,
            fetchedAt: new Date().toISOString(),
            strikes,
            legs,
            provider: "DEMO (deterministic simulated chain)",
            source: "DEMO",
          };
          const integrity = computeIntegrity(snapshot, {
            demo: true,
            minCoverage: 5,
            fromLkg: false,
            lastLiveFetchAt: null,
            yahooSpot,
          });
          return {
            snapshot,
            expiries,
            selectedExpiry: selectedIso,
            step,
            degraded: false,
            errorMessage: null,
            integrity,
            yahooSpot,
          };
        }

        /* ------------------------ LIVE MODE ------------------------ */
        try {
          const raw = await fetchJson<unknown>(
            `https://www.nseindia.com/api/option-chain-indices?symbol=${NSE_SYMBOLS[sym]}`,
            {
              timeoutMs: 6000,
              retries: 1,
              headers: {
                Accept: "application/json, text/plain, */*",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: "https://www.nseindia.com/option-chain",
              },
            },
          );
          const json = parseProvider(NseFullChain, raw, "NSE option chain");
          const rows = json.records?.data ?? [];
          const rawExpiries = json.records?.expiryDates ?? [];
          if (!rows.length || !rawExpiries.length) throw new Error("empty chain");
          const isoExpiries = rawExpiries
            .map(toIsoDate)
            .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e))
            .sort();
          const expiries = categorizeExpiries(isoExpiries);
          const selectedIso =
            data.expiry && isoExpiries.includes(data.expiry) ? data.expiry : isoExpiries[0];

          const legs: OptionLeg[] = [];
          const strikeSet = new Set<number>();
          for (const r of rows) {
            const rowExpiry = toIsoDate(r.expiryDate ?? r.CE?.expiryDate ?? r.PE?.expiryDate ?? "");
            if (rowExpiry !== selectedIso) continue;
            const strike = r.strikePrice ?? r.CE?.strikePrice ?? r.PE?.strikePrice;
            if (strike == null) continue;
            strikeSet.add(strike);
            if (r.CE) {
              legs.push({
                strike,
                side: "CE",
                oi: r.CE.openInterest ?? 0,
                changeOi: r.CE.changeinOpenInterest ?? 0,
                volume: r.CE.totalTradedVolume ?? 0,
                ltp: r.CE.lastPrice ?? 0,
                changePct: r.CE.pChange ?? 0,
                iv: r.CE.impliedVolatility ?? null,
                bid: r.CE.bidprice ?? null,
                ask: r.CE.askPrice ?? null,
              });
            }
            if (r.PE) {
              legs.push({
                strike,
                side: "PE",
                oi: r.PE.openInterest ?? 0,
                changeOi: r.PE.changeinOpenInterest ?? 0,
                volume: r.PE.totalTradedVolume ?? 0,
                ltp: r.PE.lastPrice ?? 0,
                changePct: r.PE.pChange ?? 0,
                iv: r.PE.impliedVolatility ?? null,
                bid: r.PE.bidprice ?? null,
                ask: r.PE.askPrice ?? null,
              });
            }
          }
          if (!legs.length) throw new Error("no legs for selected expiry");
          const strikes = Array.from(strikeSet).sort((a, b) => a - b);
          const nseSpot = json.records?.underlyingValue ?? spotInfo.price ?? 0;
          const snapshot: OptionChainSnapshot = {
            symbol: sym,
            spot: nseSpot,
            expiry: selectedIso,
            fetchedAt: new Date().toISOString(),
            strikes,
            legs,
            provider: "NSE",
            source: "NSE",
          };
          const integrity = computeIntegrity(snapshot, {
            demo: false,
            minCoverage: 5,
            fromLkg: false,
            lastLiveFetchAt: snapshot.fetchedAt,
            yahooSpot,
          });
          LKG.set(lkgKey(sym, selectedIso), {
            snapshot,
            expiries,
            yahooSpot,
            tradingDate: currentTradingDate(),
            fetchedAtMs: Date.now(),
          });
          return {
            snapshot,
            expiries,
            selectedExpiry: selectedIso,
            step,
            degraded: false,
            errorMessage: null,
            integrity,
            yahooSpot,
          };
        } catch (err) {
          const errMsg =
            err instanceof Error
              ? `Live NSE option-chain feed unavailable (${err.message}).`
              : "Live NSE option-chain feed unavailable.";
          // Try last-known-good cache — same symbol / expiry / trading date, within stale window.
          const today = currentTradingDate();
          const preferredExpiry = data.expiry;
          const candidateKeys = preferredExpiry
            ? [lkgKey(sym, preferredExpiry)]
            : Array.from(LKG.keys()).filter((k) => k.startsWith(`${sym}::`));
          for (const k of candidateKeys) {
            const lkg = LKG.get(k);
            if (!lkg) continue;
            if (lkg.tradingDate !== today) continue;
            const ageSec = Math.round((Date.now() - lkg.fetchedAtMs) / 1000);
            // Only serve LKG within the stale threshold; older data is treated as UNAVAILABLE.
            if (ageSec > FRESHNESS_THRESHOLDS.delayedMaxSec * 4) continue;
            const lkgSnapshot: OptionChainSnapshot = {
              ...lkg.snapshot,
              provider: `${lkg.snapshot.provider} (last-known-good)`,
              source: "LAST_KNOWN_GOOD",
            };
            const integrity = computeIntegrity(lkgSnapshot, {
              demo: false,
              minCoverage: 5,
              fromLkg: true,
              lastLiveFetchAt: lkg.snapshot.fetchedAt,
              yahooSpot,
            });
            return {
              snapshot: lkgSnapshot,
              expiries: lkg.expiries,
              selectedExpiry: lkg.snapshot.expiry,
              step,
              degraded: true,
              errorMessage: `${errMsg} Serving last-known-good snapshot from ${new Date(lkg.snapshot.fetchedAt).toLocaleTimeString()}.`,
              integrity,
              yahooSpot,
            };
          }
          return emptyUnavailableResponse(
            sym,
            data.expiry,
            step,
            yahooSpot,
            `${errMsg} No last-known-good snapshot available for the current session.`,
          );
        }
      },
      { ttlMs: 30_000 },
    );
  });