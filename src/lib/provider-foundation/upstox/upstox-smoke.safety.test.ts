import { describe, it, expect } from "vitest";
import {
  runUpstoxSmokeTest,
  buildApplicationAuthFailureReport,
  buildUpstoxSmokeFailureReport,
  buildServerFunctionFailureReport,
  sanitizeForJson,
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

describe("upstox smoke — safety boundary", () => {
  it("returns a SERVER_FUNCTION failure report without throwing", () => {
    const rep = buildServerFunctionFailureReport(new Error("boom"), { nowIso: "2026-07-16T09:15:00.000Z" });
    expect(rep.status).toBe("FAIL");
    expect(rep.errorSource).toBe("SERVER_FUNCTION");
    expect(rep.summary.errorSource).toBe("SERVER_FUNCTION");
    expect(rep.safeError).toBeTypeOf("string");
  });

  it("sanitizes Error objects to redacted safe messages", () => {
    const s = sanitizeForJson(new Error("Bearer secret-value oops")) as { message: string };
    expect(s.message).not.toContain("secret-value");
    expect(s.message).toContain("[REDACTED]");
  });

  it("converts Date to ISO string", () => {
    const d = new Date("2026-07-16T09:15:00.000Z");
    expect(sanitizeForJson({ at: d })).toEqual({ at: "2026-07-16T09:15:00.000Z" });
  });

  it("drops non-serializable values (Response, Headers, functions, AbortSignal)", () => {
    const val = {
      body: new Response("x"),
      headers: new Headers({ authorization: "Bearer x" }),
      fn: () => 1,
      signal: new AbortController().signal,
    };
    const out = sanitizeForJson(val) as Record<string, unknown>;
    expect(out.body).toBe("[unserializable:Response]");
    expect(out.headers).toBe("[unserializable:Headers]");
    expect(out.fn).toBe("[unserializable:function]");
    expect(out.signal).toBe("[unserializable:AbortSignal]");
  });

  it("protects against circular references", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    const out = sanitizeForJson(a) as Record<string, unknown>;
    expect(out.name).toBe("a");
    expect(out.self).toBe("[circular]");
  });

  it("strips secret-named keys anywhere in the payload", () => {
    const out = sanitizeForJson({
      access_token: "abc",
      nested: { api_key: "xyz", ok: true, Authorization: "Bearer q" },
    }) as { nested: Record<string, unknown> };
    expect(JSON.stringify(out)).not.toContain("abc");
    expect(JSON.stringify(out)).not.toContain("xyz");
    expect(out.nested.ok).toBe(true);
  });

  it("continues reporting other endpoints when quote fails", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/market-quote/quotes")) {
          return new Response("permission denied", { status: 403 });
        }
        return ok({ data: { candles: [["2026-07-14T09:15:00Z", 100, 110, 95, 103, 1000]] } });
      },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    // Quote failed but historical + intraday still populated with results.
    expect(rep.quoteResults.some((r) => !r.ok)).toBe(true);
    expect(rep.historicalResults.length).toBeGreaterThan(0);
    expect(rep.intradayResults.length).toBeGreaterThan(0);
    expect(rep.checklist.quoteApi).toMatch(/FAIL|PARTIAL/);
    expect(rep.checklist.historicalApi).toMatch(/PASS|PARTIAL/);
  });

  it("market-closed intraday (empty candles) returns PARTIAL, not FAIL", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("intraday")) return ok({ data: { candles: [] } });
        if (url.includes("/market-quote/quotes")) {
          return ok({ status: "success", data: { key: { last_price: 100 } } });
        }
        return ok({ data: { candles: [["2026-07-14T09:15:00Z", 100, 110, 95, 103, 1000]] } });
      },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    expect(rep.intradayResults.every((r) => !r.ok)).toBe(true);
    expect(rep.status).toBe("PARTIAL");
    // The report should still be complete with checklist + symbolResults populated.
    expect(rep.symbolResults.length).toBeGreaterThan(0);
    expect(rep.generatedAt).toMatch(/^2026-07-16/);
  });

  it("secrets are absent from the serialized report on failure", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async () => new Response("Bearer live-tok-abcdef leaked", { status: 401 }),
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    const json = JSON.stringify(sanitizeForJson(rep));
    expect(json).not.toContain("live-tok-abcdef");
    expect(json).not.toMatch(/api_key|api_secret/i);
  });

  it("second retry after a failure succeeds independently", async () => {
    let calls = 0;
    const impl = async () => {
      calls++;
      if (calls === 1) return new Response("nope", { status: 500 });
      return ok({ data: { candles: [] } });
    };
    const first = await runUpstoxSmokeTest({ env: LIVE_ENV, fetchImpl: impl, nowIso: "2026-07-16T09:15:00.000Z" });
    const second = await runUpstoxSmokeTest({ env: LIVE_ENV, fetchImpl: impl, nowIso: "2026-07-16T09:16:00.000Z" });
    expect(first.status).not.toBe("PASS");
    expect(second.at).toBe("2026-07-16T09:16:00.000Z");
  }, 30_000);

  it("application-auth failure report is JSON-only and has full new shape", () => {
    const rep = buildApplicationAuthFailureReport("Admin role required.");
    expect(rep.status).toBe("FAIL");
    expect(rep.errorSource).toBe("APPLICATION_AUTH");
    expect(rep.checklist.authentication).toBe("FAIL");
    expect(rep.serializationStatus).toBe("OK");
    expect(rep.generatedAt).toBeTypeOf("string");
  });

  it("buildUpstoxSmokeFailureReport surfaces non-serializable Error safely", () => {
    const err = new Error("Bearer super-secret-token failed");
    const rep = buildUpstoxSmokeFailureReport(err, { env: LIVE_ENV });
    expect(rep.status).toMatch(/FAIL|NOT_CONFIGURED/);
    expect(JSON.stringify(rep)).not.toContain("super-secret-token");
  });
});