// Phase 3F.2C — Server-adapter tests. Mocks `fetch` and `process.env`; never
// makes real network or TradingView calls.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Utility: reset the module cache so env changes take effect between tests.
async function loadFresh() {
  vi.resetModules();
  const mod = await import("./collector-client.server");
  mod.__test.reset();
  return mod;
}

const OK_BODY = {
  symbol: "TVC:GOLDSILVER",
  ratio: 72.5,
  signal: "NEUTRAL",
  source: "TRADINGVIEW_UNOFFICIAL",
  marketTimestamp: 1_784_522_640,
  receivedAt: new Date().toISOString(),
  ageMs: 5_000,
  freshness: "LIVE",
  connectionStatus: "CONNECTED",
  formulaVersion: "GS_RATIO_50_80_V1",
};

function mockFetchOnce(body: unknown, init: Partial<Response> = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  process.env.TRADINGVIEW_COLLECTOR_ENABLED = "true";
  process.env.TRADINGVIEW_COLLECTOR_URL = "https://collector.example.com";
  process.env.TRADINGVIEW_COLLECTOR_API_TOKEN = "super-secret-token-value";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TRADINGVIEW_COLLECTOR_ENABLED;
  delete process.env.TRADINGVIEW_COLLECTOR_URL;
  delete process.env.TRADINGVIEW_COLLECTOR_API_TOKEN;
});

describe("collector-client.server", () => {
  it("returns UNAVAILABLE when disabled", async () => {
    process.env.TRADINGVIEW_COLLECTOR_ENABLED = "false";
    const mod = await loadFresh();
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(s.signal).toBe("UNAVAILABLE");
    expect(s.ratio).toBeNull();
  });

  it("returns UNAVAILABLE when URL or token missing", async () => {
    delete process.env.TRADINGVIEW_COLLECTOR_URL;
    const mod = await loadFresh();
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(s.signal).toBe("UNAVAILABLE");
    expect(s.reason).toMatch(/URL or API token/i);
  });

  it("sends bearer token and returns validated snapshot", async () => {
    const mod = await loadFresh();
    const spy = mockFetchOnce(OK_BODY);
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0]!;
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer super-secret-token-value");
    expect(s.symbol).toBe("TVC:GOLDSILVER");
    expect(s.ratio).toBe(72.5);
    expect(s.signal).toBe("NEUTRAL");
  });

  it("does NOT retry on 401 unauthorized", async () => {
    const mod = await loadFresh();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 401 }));
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(spy).toHaveBeenCalledOnce();
    expect(s.signal).toBe("UNAVAILABLE");
    expect(s.reason).toMatch(/unauthorized/i);
  });

  it("retries on transient HTTP error", async () => {
    const mod = await loadFresh();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("boom", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(OK_BODY), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(s.signal).toBe("NEUTRAL");
  });

  it("caches successful snapshots for TTL", async () => {
    const mod = await loadFresh();
    const spy = mockFetchOnce(OK_BODY);
    await mod.getGoldSilverRatioSnapshot();
    await mod.getGoldSilverRatioSnapshot();
    expect(spy).toHaveBeenCalledOnce(); // second call served from cache
  });

  it("rejects malformed collector response", async () => {
    const mod = await loadFresh();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ symbol: "OTHER", ratio: 10 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(s.signal).toBe("UNAVAILABLE");
  });

  it("clears actionable signal when remote reports STALE", async () => {
    const mod = await loadFresh();
    mockFetchOnce({ ...OK_BODY, freshness: "STALE", signal: "BUY_GOLD" });
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(s.freshness).toBe("STALE");
    expect(s.signal).toBe("UNAVAILABLE");
  });

  it("returns UNAVAILABLE on invalid JSON", async () => {
    const mod = await loadFresh();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const s = await mod.getGoldSilverRatioSnapshot();
    expect(s.signal).toBe("UNAVAILABLE");
  });

  it("masks token in diagnostics; never returns raw token", async () => {
    const mod = await loadFresh();
    const cfg = mod.readCollectorConfig();
    expect(cfg.tokenConfigured).toBe(true);
    expect(cfg.tokenMasked).toBeTruthy();
    expect(cfg.tokenMasked).not.toContain("super-secret-token-value");
    // Object should not expose the raw token under any key
    expect(JSON.stringify(cfg)).not.toContain("super-secret-token-value");
  });
});

describe("collector-client secret exposure guard", () => {
  it("does not import @mathieuc/tradingview from the client bundle", async () => {
    // The adapter module is `.server.ts` and TanStack blocks it from client
    // bundles. This test is a smoke assertion that nothing in the adapter
    // static-imports @mathieuc/tradingview.
    const fs = await import("fs");
    const src = await fs.promises.readFile(
      "src/lib/tradingview/collector-client.server.ts",
      "utf8",
    );
    // Guard: no static or dynamic import of the Node-only package.
    expect(src).not.toMatch(/from\s+["']@mathieuc\/tradingview["']/);
    expect(src).not.toMatch(/import\(\s*["']@mathieuc\/tradingview["']\s*\)/);
    const contract = await fs.promises.readFile(
      "src/lib/tradingview/snapshot-contract.ts",
      "utf8",
    );
    expect(contract).not.toMatch(/@mathieuc\/tradingview/);
  });
});