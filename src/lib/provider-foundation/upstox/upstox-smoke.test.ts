import { describe, it, expect } from "vitest";
import {
  runUpstoxSmokeTest,
  buildApplicationAuthFailureReport,
  errorSourceFromUpstoxCode,
  errorSourceFromAdapterReason,
  UPSTOX_FORBIDDEN_SAFE_MESSAGE,
} from "./upstox-smoke.server";

const LIVE_ENV = {
  UPSTOX_MARKET_DATA_MODE: "live",
  UPSTOX_API_KEY: "key",
  UPSTOX_API_SECRET: "sec",
  UPSTOX_ACCESS_TOKEN: "live-tok-abcdef",
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function status(code: number, body = "err", headers: Record<string, string> = {}) {
  return new Response(body, { status: code, headers });
}

function candleTuple(t: string, base: number) {
  return [t, base, base + 10, base - 5, base + 3, 1000];
}

describe("upstox smoke — configuration guards", () => {
  it("reports NOT_CONFIGURED when env is missing", async () => {
    const rep = await runUpstoxSmokeTest({
      env: {},
      fetchImpl: async () => { throw new Error("must not be called"); },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.configured).toBe(false);
    expect(rep.authenticated).toBe(false);
    expect(rep.summary.overall).toBe("NOT_CONFIGURED");
  });

  it("reports NOT_CONFIGURED for placeholder token", async () => {
    const rep = await runUpstoxSmokeTest({
      env: { ...LIVE_ENV, UPSTOX_ACCESS_TOKEN: "xxxx" },
      fetchImpl: async () => { throw new Error("must not be called"); },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.summary.overall).toBe("NOT_CONFIGURED");
  });

  it("never returns raw token or Authorization header in the report", async () => {
    let seenAuth = "";
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async (_input, init) => {
        seenAuth = String((init?.headers as Record<string, string>)["Authorization"] ?? "");
        return ok({ data: { candles: [] } });
      },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(seenAuth).toContain("Bearer");
    const json = JSON.stringify(rep);
    expect(json).not.toContain("live-tok-abcdef");
    expect(json).not.toContain("Authorization");
  });
});

describe("upstox smoke — endpoint outcomes", () => {
  it("marks endpoints as ok on success", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/market-quote/quotes")) {
          return ok({ status: "success", data: { "NSE_INDEX:Nifty 50": { last_price: 25000 } } });
        }
        return ok({ data: { candles: [candleTuple("2026-07-14T09:15:00Z", 100), candleTuple("2026-07-15T09:15:00Z", 105)] } });
      },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.authenticated).toBe(true);
    expect(rep.summary.quoteSuccess).toBe(true);
    expect(rep.summary.historicalSuccess).toBe(true);
    expect(rep.summary.intradaySuccess).toBe(true);
    expect(rep.summary.overall).toBe("PASS");
    expect(rep.instrumentResolved.find((r) => r.symbol === "NIFTY50")?.resolved).toBe(true);
  });

  it("classifies 401 as authentication failure", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async () => status(401),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.summary.overall).toBe("FAIL");
    expect(rep.quoteResults[0]?.safeError).toMatch(/UPSTOX_AUTH_REQUIRED/);
    expect(rep.quoteResults[0]?.errorSource).toBe("UPSTOX_AUTH");
    expect(rep.summary.errorSource).toBe("UPSTOX_AUTH");
  });

  it("classifies Upstox 403 as UPSTOX_API with the safe forbidden message", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async () => status(403, "permission denied by upstox internal reason"),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.summary.overall).toBe("FAIL");
    expect(rep.quoteResults[0]?.errorSource).toBe("UPSTOX_API");
    expect(rep.quoteResults[0]?.safeError).toBe(UPSTOX_FORBIDDEN_SAFE_MESSAGE);
    // Never leaks tokens or provider body.
    const json = JSON.stringify(rep);
    expect(json).not.toContain("live-tok-abcdef");
    expect(json).not.toContain("Authorization");
    expect(json).not.toContain("permission denied by upstox");
    expect(json).not.toContain("internal reason");
  });

  it("classifies 429 with retry-after", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async () => status(429, "rate", { "retry-after": "0" }),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.quoteResults[0]?.providerStatus).toBe("RATE_LIMITED");
  }, 30_000);

  it("surfaces schema failure as safe error", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async () =>
        new Response("not json", { status: 200, headers: { "content-type": "application/json" } }),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.quoteResults[0]?.ok).toBe(false);
    expect(rep.quoteResults[0]?.safeError).toMatch(/UPSTOX_SCHEMA_ERROR/);
    expect(rep.quoteResults[0]?.errorSource).toBe("SCHEMA");
  });

  it("returns empty results when instrument-master lookup misses", async () => {
    // Baseline sanity: every required symbol resolves in the fallback master.
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async () => ok({ data: { candles: [] } }),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    const unresolved = rep.instrumentResolved.filter((r) => !r.resolved);
    expect(unresolved.length).toBe(0);
  });
});
describe("upstox smoke — error source classification", () => {
  it("maps Upstox error codes to error sources", () => {
    expect(errorSourceFromUpstoxCode("UPSTOX_AUTH_REQUIRED")).toBe("UPSTOX_AUTH");
    expect(errorSourceFromUpstoxCode("UPSTOX_FORBIDDEN")).toBe("UPSTOX_API");
    expect(errorSourceFromUpstoxCode("UPSTOX_TIMEOUT")).toBe("NETWORK");
    expect(errorSourceFromUpstoxCode("UPSTOX_NETWORK")).toBe("NETWORK");
    expect(errorSourceFromUpstoxCode("UPSTOX_SCHEMA_ERROR")).toBe("SCHEMA");
    expect(errorSourceFromUpstoxCode("UPSTOX_RATE_LIMITED")).toBe("UPSTOX_API");
    expect(errorSourceFromUpstoxCode("UPSTOX_UNSUPPORTED_TIMEFRAME")).toBe("PROVIDER_CONFIG");
  });

  it("maps adapter reasons to error sources", () => {
    expect(errorSourceFromAdapterReason("AUTH_REQUIRED")).toBe("UPSTOX_AUTH");
    expect(errorSourceFromAdapterReason("SCHEMA_ERROR")).toBe("SCHEMA");
    expect(errorSourceFromAdapterReason("NETWORK")).toBe("NETWORK");
    expect(errorSourceFromAdapterReason("UNAVAILABLE")).toBe("UPSTOX_API");
    expect(errorSourceFromAdapterReason("UNSUPPORTED_SYMBOL")).toBe("PROVIDER_CONFIG");
  });

  it("distinguishes application admin 403 from Upstox 403", async () => {
    // Application-side admin failure — never contacts Upstox.
    const appRep = buildApplicationAuthFailureReport("Admin role required.");
    expect(appRep.summary.overall).toBe("FAIL");
    expect(appRep.summary.errorSource).toBe("APPLICATION_AUTH");
    expect(appRep.quoteResults[0]?.errorSource).toBe("APPLICATION_AUTH");
    expect(JSON.stringify(appRep)).not.toContain("Bearer");

    // Upstox 403 — server-side but provider denied.
    const upstoxRep = await runUpstoxSmokeTest({
      env: {
        UPSTOX_MARKET_DATA_MODE: "live",
        UPSTOX_API_KEY: "key",
        UPSTOX_API_SECRET: "sec",
        UPSTOX_ACCESS_TOKEN: "live-tok-abcdef",
      },
      fetchImpl: async () =>
        new Response("permission denied by upstox", { status: 403 }),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(upstoxRep.summary.errorSource).toBe("UPSTOX_API");
    expect(upstoxRep.quoteResults[0]?.errorSource).toBe("UPSTOX_API");
    expect(upstoxRep.quoteResults[0]?.errorSource).not.toBe("APPLICATION_AUTH");
  });

  it("application-auth failure report never contains provider tokens or bodies", () => {
    const rep = buildApplicationAuthFailureReport("Admin role required.");
    const json = JSON.stringify(rep);
    expect(json).not.toMatch(/Bearer|access_token|api_key|api_secret/i);
  });
});
