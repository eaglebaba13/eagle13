import process from "node:process";

function num(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const config = {
  port: num("PORT", 8787),
  host: process.env.HOST ?? "0.0.0.0",
  apiToken: process.env.COLLECTOR_API_TOKEN ?? "",
  symbol: process.env.TRADINGVIEW_SYMBOL ?? "TVC:GOLDSILVER",
  staleAfterMs: num("TRADINGVIEW_RATIO_STALE_AFTER_MS", 120_000),
  unavailableAfterMs: num("TRADINGVIEW_RATIO_UNAVAILABLE_AFTER_MS", 600_000),
  reconnectBaseMs: num("RECONNECT_BASE_MS", 1_000),
  reconnectMaxMs: num("RECONNECT_MAX_MS", 60_000),
  rateLimitPerMin: num("RATE_LIMIT_PER_MIN", 60),
  maxResponseBytes: num("MAX_RESPONSE_BYTES", 4_096),
  formulaVersion: "GS_RATIO_50_80_V1",
};

export function assertConfig() {
  if (!config.apiToken || config.apiToken.length < 12) {
    throw new Error(
      "COLLECTOR_API_TOKEN missing or too short — set a strong shared secret.",
    );
  }
  if (config.staleAfterMs >= config.unavailableAfterMs) {
    throw new Error(
      "TRADINGVIEW_RATIO_STALE_AFTER_MS must be < TRADINGVIEW_RATIO_UNAVAILABLE_AFTER_MS",
    );
  }
}