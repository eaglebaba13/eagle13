import { describe, it, expect } from "vitest";
import { parseUpstoxErrorCode } from "./upstox-http.server";
import {
  classifyUpstoxTokenFormat,
  evaluateUpstoxTokenPolicy,
} from "./upstox-token-policy.server";
import { runUpstoxSmokeTest } from "./upstox-smoke.server";

const LIVE_ENV = {
  UPSTOX_MARKET_DATA_MODE: "live",
  UPSTOX_API_KEY: "key",
  UPSTOX_API_SECRET: "sec",
  UPSTOX_ACCESS_TOKEN: "analytics-opaque-token-abc123xyz",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("upstox diagnostics — error code + token classification", () => {
  it("parses UDAPI errorCode from a v2 error envelope", () => {
    const code = parseUpstoxErrorCode(
      JSON.stringify({ status: "error", errors: [{ errorCode: "UDAPI100050", message: "Invalid token" }] }),
    );
    expect(code).toBe("UDAPI100050");
  });

  it("returns undefined for empty/non-JSON bodies", () => {
    expect(parseUpstoxErrorCode("")).toBeUndefined();
    expect(parseUpstoxErrorCode("<html>oops</html>")).toBeUndefined();
    expect(parseUpstoxErrorCode(JSON.stringify({ ok: true }))).toBeUndefined();
  });

  it("classifies a JWT-shaped token as STANDARD", () => {
    // Not a real token — three base64url segments starting with eyJ.
    const fake = "eyJhbGciOi.eyJzdWIiOiJ4.sig-part";
    const { format, guess } = classifyUpstoxTokenFormat(fake);
    expect(format).toBe("JWT");
    expect(guess).toBe("STANDARD");
  });

  it("classifies an opaque long token as ANALYTICS", () => {
    const { format, guess } = classifyUpstoxTokenFormat("opaque-analytics-token-1234567890");
    expect(format).toBe("OPAQUE");
    expect(guess).toBe("ANALYTICS");
  });

  it("token status surfaces guess without leaking token value", () => {
    const st = evaluateUpstoxTokenPolicy({
      UPSTOX_MARKET_DATA_MODE: "live",
      UPSTOX_API_KEY: "k",
      UPSTOX_API_SECRET: "s",
      UPSTOX_ACCESS_TOKEN: "opaque-token-value-not-a-jwt",
    });
    expect(st.tokenTypeGuess).toBe("ANALYTICS");
    expect(st.tokenFormat).toBe("OPAQUE");
    expect(JSON.stringify(st)).not.toContain("opaque-token-value-not-a-jwt");
  });

  it("propagates UDAPI code, http status, path, and token type to smoke results", async () => {
    const rep = await runUpstoxSmokeTest({
      env: LIVE_ENV,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("/market-quote/quotes")) {
          return jsonResponse(
            { status: "error", errors: [{ errorCode: "UDAPI100050", message: "Unauthorized" }] },
            401,
          );
        }
        if (url.includes("/intraday/")) {
          return jsonResponse(
            { status: "error", errors: [{ errorCode: "UDAPI100050", message: "Unauthorized" }] },
            401,
          );
        }
        // historical succeeds
        return jsonResponse({ data: { candles: [["2026-07-14T09:15:00Z", 100, 110, 95, 103, 1000]] } }, 200);
      },
      nowIso: "2026-07-16T09:15:00.000Z",
    });
    const q = rep.quoteResults.find((r) => !r.ok);
    expect(q?.httpStatus).toBe(401);
    expect(q?.upstoxErrorCode).toBe("UDAPI100050");
    expect(q?.endpointPath).toContain("v2/market-quote/quotes");
    expect(q?.tokenType).toBe("ANALYTICS");
    expect(q?.instrumentKey).toBeTruthy();
    expect(q?.requestTimestamp).toBeTruthy();

    const i = rep.intradayResults.find((r) => !r.ok);
    expect(i?.httpStatus).toBe(401);
    expect(i?.upstoxErrorCode).toBe("UDAPI100050");
    expect(i?.endpointPath).toContain("v3/historical-candle/intraday/");

    // Secrets never leak.
    const json = JSON.stringify(rep);
    expect(json).not.toContain(LIVE_ENV.UPSTOX_ACCESS_TOKEN);
    expect(json).not.toContain(LIVE_ENV.UPSTOX_API_SECRET);
  });
});