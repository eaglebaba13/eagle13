import { describe, it, expect } from "vitest";
import { UpstoxOptionChainProvider } from "./upstox-provider.server";
import { UpstoxHttpClient } from "../provider-foundation/upstox/upstox-http.server";

function makeFetch(recorder: string[], scenario: "ok" | "missing-expiry-400") {
  return async (url: string) => {
    recorder.push(url);
    const u = new URL(url);
    if (u.pathname.endsWith("/v2/option/contract")) {
      return new Response(
        JSON.stringify({ data: { expiries: ["2026-07-24", "2026-07-31", "2026-08-28"] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u.pathname.endsWith("/v2/option/chain")) {
      if (!u.searchParams.get("expiry_date")) {
        // Mirrors observed Upstox behaviour: HTTP 400 when expiry_date missing.
        return new Response(
          JSON.stringify({
            status: "error",
            errors: [{ errorCode: "UDAPI100013", message: "expiry_date is required" }],
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      if (scenario === "missing-expiry-400") {
        return new Response("{}", { status: 400 });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              strike_price: 24000,
              expiry: u.searchParams.get("expiry_date"),
              underlying_spot_price: 24010,
              call_options: { market_data: { oi: 100, ltp: 50 } },
              put_options: { market_data: { oi: 80, ltp: 40 } },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("not found", { status: 404 });
  };
}

function newProvider(fetchImpl: typeof fetch) {
  const http = new UpstoxHttpClient({
    fetchImpl,
    env: {
      UPSTOX_MARKET_DATA_MODE: "LIVE",
      UPSTOX_API_KEY: "k",
      UPSTOX_API_SECRET: "s",
      UPSTOX_ACCESS_TOKEN: "tok",
    },
    maxRetries: 0,
    backoffBaseMs: 0,
  });
  return new UpstoxOptionChainProvider(http);
}

describe("UpstoxOptionChainProvider expiry auto-resolution", () => {
  it("resolves nearest expiry before calling option/chain (NIFTY)", async () => {
    const urls: string[] = [];
    const p = newProvider(makeFetch(urls, "ok") as unknown as typeof fetch);
    const r = await p.fetchSnapshot({ underlying: "NIFTY" });
    expect(r.ok).toBe(true);
    // contract lookup happens first, then chain with expiry_date populated.
    expect(urls[0]).toContain("/v2/option/contract");
    expect(urls[1]).toContain("/v2/option/chain");
    expect(urls[1]).toContain("expiry_date=");
  });

  it("resolves nearest expiry for BANKNIFTY", async () => {
    const urls: string[] = [];
    const p = newProvider(makeFetch(urls, "ok") as unknown as typeof fetch);
    const r = await p.fetchSnapshot({ underlying: "BANKNIFTY" });
    expect(r.ok).toBe(true);
    expect(urls[1]).toMatch(/expiry_date=\d{4}-\d{2}-\d{2}/);
  });

  it("preserves Upstox error code in safeError on HTTP 400", async () => {
    const urls: string[] = [];
    // Force chain to 400 even when expiry present.
    const p = newProvider(makeFetch(urls, "missing-expiry-400") as unknown as typeof fetch);
    const r = await p.fetchSnapshot({ underlying: "NIFTY", expiry: "2026-07-24" });
    expect(r.ok).toBe(false);
    // upstreamCode carries through when present; safeError never leaks tokens.
    expect(r.meta.safeError).not.toContain("Bearer");
  });

  it("surfaces upstoxErrorCode via safeError when body includes UDAPI code", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      if (u.pathname.endsWith("/v2/option/contract")) {
        return new Response(JSON.stringify({ data: { expiries: [] } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ errors: [{ errorCode: "UDAPI100050", message: "denied" }] }),
        { status: 400 },
      );
    };
    const p = newProvider(fetchImpl as unknown as typeof fetch);
    const r = await p.fetchSnapshot({ underlying: "NIFTY", expiry: "2026-07-24" });
    expect(r.ok).toBe(false);
    expect(r.meta.upstreamCode).toBe("UDAPI100050");
    expect(r.meta.safeError ?? "").toContain("UDAPI100050");
  });
});