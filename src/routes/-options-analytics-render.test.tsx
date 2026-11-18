import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { OptionsChainResponse } from "@/lib/options-chain.functions";

const state = vi.hoisted(() => ({ chain: undefined as OptionsChainResponse | undefined }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0] === "options-chain" ? state.chain : undefined,
    isPending: false, isError: queryKey[0] !== "options-chain" || !state.chain, refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/options-chain.functions", () => ({ getOptionsChain: vi.fn() }));
vi.mock("@/lib/astro.functions", () => ({ getAstro: vi.fn() }));
vi.mock("@/lib/market.functions", () => ({ getMarketData: vi.fn() }));
vi.mock("@/components/ApexChart", () => ({ ApexChart: () => createElement("div", { "data-chart": true }) }));

import { OptionsAnalyticsPage, Route } from "./options-analytics";

describe("Momentic Options Analytics regression", () => {
  it("does not await optional feed failures in the route loader", () => {
    const prefetchQuery = vi.fn(async () => undefined);
    (Route as unknown as { options: { loader: (args: unknown) => void } }).options.loader({ context: { queryClient: { prefetchQuery } } });
    expect(prefetchQuery).toHaveBeenCalledTimes(3);
  });

  it("renders controls, GEX, Max Pain and tables despite unavailable Astro/market feeds and malformed legs", () => {
    state.chain = {
      snapshot: { symbol: "NIFTY", spot: 25000, expiry: "2026-11-19", fetchedAt: "2026-11-16T04:30:00Z", provider: "Verified", source: "UPSTOX",
        strikes: [24950, 25000, 25050], legs: [null, {}, ...[24950, 25000, 25050].flatMap((strike) => [
          { strike, side: "CE", oi: 100, volume: null, ltp: 25, iv: undefined },
          { strike, side: "PE", oi: 200, volume: 0, ltp: 30, changeOi: null, iv: null },
        ])] },
      expiries: [{ expiry: "2026-11-19", category: "WEEKLY", daysToExpiry: 3 }], selectedExpiry: "2026-11-19", step: 50,
      degraded: false, errorMessage: null, yahooSpot: null, integrity: { sourceStatus: "LIVE", providerTimestamp: "2026-11-16T04:30:00Z" },
    } as unknown as OptionsChainResponse;
    const html = renderToStaticMarkup(createElement(OptionsAnalyticsPage));
    expect(html).toContain("BANK NIFTY");
    expect(html).toContain("Max Pain Strike");
    expect(html).toContain("Net GEX");
    expect(html).toContain("24950");
    expect(html).toContain("Optional Astro or market context unavailable");
    expect(html).not.toContain("NaN");
  });

  it("keeps the terminal controls available on a cold provider failure", () => {
    state.chain = undefined;
    const html = renderToStaticMarkup(createElement(OptionsAnalyticsPage));
    expect(html).toContain("BANK NIFTY");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Something went wrong");
  });
});
