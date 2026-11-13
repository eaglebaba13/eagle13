// Phase 38 — Server RPC Functions for AI LTP Calculator & COA 1.0 Engine
// Provides type-safe RPCs for Live Option Chain, 09:20 Static Levels, and LTP Blast Screener.

import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import type {
  LtpCalculatorOutput,
  StockFourLineLevels,
} from "./ltp-calculator-engine.server";

export interface GetLtpCalculatorInput {
  readonly underlying?: string;
  readonly expiry?: string;
}

export const getLtpCalculatorData = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): GetLtpCalculatorInput => {
    const input = (raw ?? {}) as Partial<GetLtpCalculatorInput>;
    return {
      underlying: typeof input.underlying === "string" ? input.underlying.toUpperCase() : "NIFTY",
      expiry: typeof input.expiry === "string" ? input.expiry : undefined,
    };
  })
  .handler(async ({ data }) => {
    try {
      const { fetchCanonicalOptionChain } = await import("../option-chain/canonical-snapshot.server");
      const { processOptionChainToLtpCalculator, generateMultiAssetOptionChainSnapshot } = await import(
        "./ltp-calculator-engine.server"
      );

      const sym = (data.underlying || "NIFTY").toUpperCase();

      // If requested symbol is one of the standard Upstox index underlyings, attempt Upstox live feed
      if (sym === "NIFTY" || sym === "BANKNIFTY" || sym === "SENSEX") {
        try {
          const res = await fetchCanonicalOptionChain({
            underlying: sym,
            expiry: data.expiry,
          });

          if (res.ok && res.snapshot && res.snapshot.strikes.length > 0) {
            const ltpOutput = processOptionChainToLtpCalculator(res.snapshot, "INR", "₹");
            return {
              ok: true as const,
              error: null,
              data: ltpOutput,
              availableExpiries: res.snapshot.availableExpiries,
              expiry: res.snapshot.expiry,
              provider: res.snapshot.provider,
              dataQuality: res.snapshot.dataQuality,
            };
          }
        } catch {
          // Fall through to multi-asset live generator
        }
      }

      // Universal Multi-Asset Derivatives Engine (Stocks, Crypto, Commodities, FINNIFTY, etc.)
      const { snapshot, currency, currencySymbol } = await generateMultiAssetOptionChainSnapshot(
        sym,
        data.expiry,
      );

      const ltpOutput = processOptionChainToLtpCalculator(snapshot, currency, currencySymbol);

      return {
        ok: true as const,
        error: null,
        data: ltpOutput,
        availableExpiries: snapshot.availableExpiries,
        expiry: snapshot.expiry,
        provider: snapshot.provider,
        dataQuality: snapshot.dataQuality,
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message.slice(0, 200) : "LTP calculator failure",
        data: null,
      };
    }
  });

export const getLtpBlastStocks = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): { filter?: "ALL" | "BULLISH" | "BEARISH" } => {
    const input = (raw ?? {}) as { filter?: "ALL" | "BULLISH" | "BEARISH" };
    return {
      filter: input.filter === "BULLISH" || input.filter === "BEARISH" ? input.filter : "ALL",
    };
  })
  .handler(async ({ data }) => {
    try {
      const { scanLtpBlastUniverse } = await import("./ltp-calculator-engine.server");
      const stocks = await scanLtpBlastUniverse(data.filter);

      return {
        ok: true as const,
        error: null,
        stocks,
        lastUpdated: new Date().toISOString(),
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message.slice(0, 200) : "Failed to scan LTP Blast universe",
        stocks: [] as StockFourLineLevels[],
        lastUpdated: new Date().toISOString(),
      };
    }
  });

export const getStockFourLineData = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): { symbol: string } => {
    const input = (raw ?? {}) as { symbol?: string };
    return {
      symbol: typeof input.symbol === "string" ? input.symbol.toUpperCase() : "RELIANCE",
    };
  })
  .handler(async ({ data }) => {
    try {
      const { FO_UNIVERSE } = await import("../cycles/cycle-performance.server");
      const { computeStockFourLine } = await import("./ltp-calculator-engine.server");
      const { getCachedMarketData, fetchLiveQuotesBatch } = await import(
        "../cycles/market-data-adapter.server"
      );

      const inst =
        FO_UNIVERSE.find((i) => i.symbol === data.symbol) ?? {
          symbol: data.symbol,
          name: data.symbol,
          sector: "F&O Equities",
          category: "FO_EQUITY" as const,
          marketCap: "Large Cap" as const,
          beta: 1.0,
          baseIV: 20.0,
          defaultPrice: 1000.0,
        };

      try {
        await fetchLiveQuotesBatch([data.symbol], 1);
      } catch {
        // fallback cached
      }

      const cached = getCachedMarketData(data.symbol);
      const liveLtp = cached?.ltp && cached.ltp > 0 ? cached.ltp : inst.defaultPrice;
      const fourLine = computeStockFourLine(inst, liveLtp);

      return {
        ok: true as const,
        error: null,
        fourLine,
      };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message.slice(0, 200) : "Failed to compute 4-line levels",
        fourLine: null,
      };
    }
  });

// React Query option helpers
export const ltpCalculatorQuery = (input: GetLtpCalculatorInput) =>
  queryOptions({
    queryKey: ["ltp-calculator", input.underlying ?? "NIFTY", input.expiry ?? "auto"],
    queryFn: () => getLtpCalculatorData({ data: input }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

export const ltpBlastQuery = (filter: "ALL" | "BULLISH" | "BEARISH" = "ALL") =>
  queryOptions({
    queryKey: ["ltp-blast-screener", filter],
    queryFn: () => getLtpBlastStocks({ data: { filter } }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
