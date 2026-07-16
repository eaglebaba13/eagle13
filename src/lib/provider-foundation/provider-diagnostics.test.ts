import { describe, expect, it } from "vitest";
import {
  UPSTOX_ADAPTER_ID,
  type TokenPolicyEnv,
} from "./upstox";
import { buildProviderDiagnosticsReport } from "./provider-diagnostics.server";
import { buildSmokeDiagnosticRows, dispatchSmokeTest, providerHeaderText, type SmokeReportLike } from "./provider-diagnostics-ui";

const LIVE_ENV: TokenPolicyEnv & { NODE_ENV: string } = {
  NODE_ENV: "production",
  UPSTOX_MARKET_DATA_MODE: "live",
  UPSTOX_API_KEY: "key",
  UPSTOX_API_SECRET: "secret",
  UPSTOX_ACCESS_TOKEN: "live-token",
};

const NOT_CONFIGURED_REPORT: SmokeReportLike = {
  configured: false,
  authenticated: false,
  tokenStatus: { tokenSource: "NONE", reason: "missing" },
  instrumentResolved: [{ resolved: true }, { resolved: true }],
  quoteResults: [],
  historicalResults: [],
  intradayResults: [],
  summary: { overall: "NOT_CONFIGURED" },
  cache: { hits: 0, misses: 0, writes: 0 },
  health: { totalCalls: 0, errors: 0, avgLatencyMs: 0 },
};

const PARTIAL_REPORT: SmokeReportLike = {
  configured: true,
  authenticated: true,
  tokenStatus: { tokenSource: "LIVE", reason: "configured" },
  instrumentResolved: [{ resolved: true }, { resolved: true }, { resolved: false }],
  quoteResults: [{ ok: true, latencyMs: 10 }, { ok: false, latencyMs: 12 }],
  historicalResults: [{ ok: true, latencyMs: 20 }],
  intradayResults: [{ ok: false, latencyMs: 30 }],
  summary: { overall: "PARTIAL" },
  cache: { hits: 1, misses: 2, writes: 1 },
  health: { totalCalls: 4, errors: 2, avgLatencyMs: 18 },
};

describe("provider diagnostics wiring", () => {
  it("selects the real Upstox provider when live credentials are configured", async () => {
    const report = await buildProviderDiagnosticsReport({
      env: LIVE_ENV,
      nowIso: "2026-07-16T09:15:00.000Z",
    });

    expect(report.realProviderActive).toBe(true);
    expect(report.mockActive).toBe(false);
    expect(report.providerSelected).toBe(UPSTOX_ADAPTER_ID);
    expect(report.diagnostics.wirings.map((w) => w.primary)).toEqual([UPSTOX_ADAPTER_ID, UPSTOX_ADAPTER_ID]);
    expect(JSON.stringify(report)).not.toContain("primary-mock");
  });

  it("falls back to mock adapters when credentials are not configured", async () => {
    const report = await buildProviderDiagnosticsReport({
      env: { NODE_ENV: "production", UPSTOX_MARKET_DATA_MODE: "live" },
      nowIso: "2026-07-16T09:15:00.000Z",
    });

    expect(report.realProviderActive).toBe(false);
    expect(report.mockActive).toBe(true);
    expect(report.providerSelected).toBe("primary-mock");
    expect(report.diagnostics.wirings[0]?.primary).toBe("primary-mock");
  });

  it("removes the mock demo banner when real provider is active", () => {
    const text = providerHeaderText({ realProviderActive: true, mockActive: false, providerSelected: UPSTOX_ADAPTER_ID });
    expect(text).toContain("real Upstox ProviderAdapter active");
    expect(text).not.toContain("demo diagnostics using mock adapters");
  });
});

describe("provider diagnostics smoke UI helpers", () => {
  it("dispatches the smoke test button action without throwing", async () => {
    let calls = 0;
    const state = await dispatchSmokeTest(async () => {
      calls += 1;
      return NOT_CONFIGURED_REPORT;
    });

    expect(calls).toBe(1);
    expect(state.kind).toBe("ok");
    if (state.kind === "ok") expect(state.report.summary.overall).toBe("NOT_CONFIGURED");
  });

  it("turns smoke failures into a redacted FAIL state", async () => {
    const state = await dispatchSmokeTest<SmokeReportLike>(async () => {
      throw new Error("Bearer secret-token UPSTOX_ACCESS_TOKEN=abc crashed");
    });

    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.status).toBe("FAIL");
      expect(state.message).toContain("[REDACTED]");
      expect(state.message).not.toContain("secret-token");
      expect(state.message).not.toContain("abc");
    }
  });

  it("renders diagnostics rows for authentication, APIs, cache and health", () => {
    const rows = buildSmokeDiagnosticRows(PARTIAL_REPORT);
    expect(rows.map((r) => r.label)).toEqual([
      "Authentication",
      "Instrument Master",
      "Quote API",
      "Historical API",
      "Intraday API",
      "Cache",
      "Health",
    ]);
    expect(rows.find((r) => r.label === "Quote API")?.status).toBe("PARTIAL");
    expect(rows.find((r) => r.label === "Intraday API")?.status).toBe("FAIL");
  });
});
