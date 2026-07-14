// Server function that fetches a live NIFTY / BANK NIFTY option-chain
// snapshot, validates the provider payload with Zod, categorises expiries,
// and normalises the result for the Options Analytics Terminal (Phase 16).
// If the upstream NSE endpoint is unreachable (common from datacenter IPs
// because it requires browser cookies), the function transparently falls
// back to a deterministic SIMULATED chain built around the live Yahoo spot
// so the terminal degrades gracefully. The `source` field is surfaced in
// the UI so users can always tell which provider produced the snapshot.
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

/* ------------------------- server fn ------------------------- */

export const getOptionsChain = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        symbol: z.enum(["NIFTY", "BANKNIFTY"]).default("NIFTY"),
        expiry: z.string().optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data }): Promise<OptionsChainResponse> => {
    const sym: OptionsSymbol = data.symbol;
    const step = STEPS[sym];
    return cached<OptionsChainResponse>(
      `options-chain:${sym}:${data.expiry ?? "auto"}`,
      async () => {
        const spotInfo = await fetchSpot(sym);
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
          const snapshot: OptionChainSnapshot = {
            symbol: sym,
            spot: json.records?.underlyingValue ?? spotInfo.price,
            expiry: selectedIso,
            fetchedAt: new Date().toISOString(),
            strikes,
            legs,
            provider: "NSE",
            source: "NSE",
          };
          return {
            snapshot,
            expiries,
            selectedExpiry: selectedIso,
            step,
            degraded: false,
            errorMessage: null,
          };
        } catch (err) {
          const iso = simulatedExpiries();
          const expiries = categorizeExpiries(iso);
          const selectedIso =
            data.expiry && iso.includes(data.expiry) ? data.expiry : iso[0];
          const { legs, strikes } = buildSimulatedChain(sym, spotInfo.price);
          const snapshot: OptionChainSnapshot = {
            symbol: sym,
            spot: spotInfo.price,
            expiry: selectedIso,
            fetchedAt: new Date().toISOString(),
            strikes,
            legs,
            provider: "SIMULATED (Yahoo spot + deterministic OI curve)",
            source: "SIMULATED",
          };
          return {
            snapshot,
            expiries,
            selectedExpiry: selectedIso,
            step,
            degraded: true,
            errorMessage:
              err instanceof Error
                ? `Live NSE option-chain feed unavailable (${err.message}). Showing a labelled simulated chain around the live spot.`
                : "Live NSE option-chain feed unavailable. Showing a labelled simulated chain around the live spot.",
          };
        }
      },
      { ttlMs: 30_000 },
    );
  });