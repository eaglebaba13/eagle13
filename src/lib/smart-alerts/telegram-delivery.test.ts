import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendTelegramMessage } from "./telegram-delivery.server";
import type { AlertEvent } from "./types";

function makeEvent(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: "test-alert-001",
    fingerprint: "fp-001",
    type: "DECISION_CHANGED",
    category: "MARKET_SIGNAL",
    priority: "HIGH",
    title: "Decision Changed",
    summary: "Bias flipped from BULLISH to BEARISH",
    instrument: "NIFTY",
    previousState: "BULLISH",
    currentState: "BEARISH",
    evidence: [
      {
        module: "DECISION_ENGINE",
        previous: "BULLISH",
        current: "BEARISH",
        freshness: "LIVE",
        available: true,
      },
    ],
    sourceModules: ["DECISION_ENGINE"],
    freshness: "LIVE",
    createdAt: "2026-07-17T04:30:00.000Z",
    tradingDate: "2026-07-17",
    expiresAt: null,
    researchOnly: true,
    disclaimer: "Research Only — Not Investment Advice — No Execution.",
    rulesVersion: "1.0.0",
    deliveryStatus: [],
    ...overrides,
  };
}

describe("telegram delivery", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns CONFIGURATION_ERROR when token is missing", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_CHAT_ID = "123";
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("CONFIGURATION_ERROR");
    expect(result.errorCode).toBe("MISSING_TELEGRAM_CREDENTIALS");
  });

  it("returns CONFIGURATION_ERROR when chat ID is missing", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    delete process.env.TELEGRAM_CHAT_ID;
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("CONFIGURATION_ERROR");
    expect(result.errorCode).toBe("MISSING_TELEGRAM_CREDENTIALS");
  });

  it("returns DELIVERED on successful API response", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("DELIVERED");
    expect(result.errorCode).toBeNull();
  });

  it("returns FAILED on Telegram API ok=false", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, description: "Bad Request" }),
    }));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toContain("TELEGRAM_API_ERROR");
  });

  it("returns FAILED on HTTP 400", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    }));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toContain("TELEGRAM_HTTP_400");
  });

  it("returns RETRYABLE_FAILURE on HTTP 429", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Too Many Requests"),
    }));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("RETRYABLE_FAILURE");
    expect(result.errorCode).toContain("TELEGRAM_HTTP_429");
  });

  it("returns RETRYABLE_FAILURE on HTTP 500", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("RETRYABLE_FAILURE");
  });

  it("returns RETRYABLE_FAILURE on network error", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("RETRYABLE_FAILURE");
    expect(result.errorCode).toContain("TELEGRAM_NETWORK_ERROR");
  });

  it("never exposes token in error messages", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "super-secret-token-12345";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
    const result = await sendTelegramMessage(makeEvent());
    expect(result.errorCode).not.toContain("super-secret-token-12345");
  });

  it("formats message with alert metadata", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    let capturedBody: string | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as string;
      return { ok: true, json: () => Promise.resolve({ ok: true }) };
    }));
    await sendTelegramMessage(makeEvent());
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.text).toContain("Decision Changed");
    expect(parsed.text).toContain("NIFTY");
    expect(parsed.text).toContain("HIGH");
    expect(parsed.parse_mode).toBe("Markdown");
  });
});
