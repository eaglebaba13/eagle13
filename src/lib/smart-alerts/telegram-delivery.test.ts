import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendTelegramMessage } from "./telegram-delivery.server";
import type { AlertEvent } from "./types";
import { defaultSubscription } from "./subscriptions";
import { TelegramAlertDeliveryProvider } from "./delivery";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    vi.unstubAllGlobals();
    vi.useRealTimers();
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      }),
    );
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("DELIVERED");
    expect(result.errorCode).toBeNull();
  });

  it.each([null, {}, { ok: "true" }, { ok: true }, { ok: true, result: { message_id: "1" } }])(
    "rejects malformed successful API payload %j",
    async (body) => {
      process.env.TELEGRAM_BOT_TOKEN = "test-token";
      process.env.TELEGRAM_CHAT_ID = "123";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
      expect(await sendTelegramMessage(makeEvent())).toEqual({
        status: "FAILED",
        errorCode: "TELEGRAM_INVALID_RESPONSE",
      });
    },
  );

  it("rejects invalid JSON without exposing its contents", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError("test-token 123");
        },
      }),
    );
    expect(await sendTelegramMessage(makeEvent())).toEqual({
      status: "FAILED",
      errorCode: "TELEGRAM_INVALID_RESPONSE",
    });
  });

  it("keeps arbitrary markup literal and includes the event timestamp", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const title = "[NIFTY]_test* <b> & 1 > 0";
    await sendTelegramMessage(makeEvent({ title }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      text: string;
      parse_mode?: string;
    };
    expect(body.parse_mode).toBeUndefined();
    expect(body.text).toContain(title);
    expect(body.text).toContain("2026-07-17T04:30:00.000Z");
  });

  it("rejects oversized messages without sending or truncating evidence", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendTelegramMessage(makeEvent({ summary: "x".repeat(4097) }))).toEqual({
      status: "FAILED",
      errorCode: "TELEGRAM_MESSAGE_LENGTH_INVALID",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out a pending request and clears the timer", async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = sendTelegramMessage(makeEvent());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ status: "RETRYABLE_FAILURE", errorCode: "TELEGRAM_TIMEOUT" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      })),
    );
    const pending = sendTelegramMessage(makeEvent());
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).errorCode).toBe("TELEGRAM_TIMEOUT");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer on network failure without echoing secrets", async () => {
    vi.useFakeTimers();
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("test-token 123")));
    expect(await sendTelegramMessage(makeEvent())).toEqual({
      status: "RETRYABLE_FAILURE",
      errorCode: "TELEGRAM_NETWORK_ERROR",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns FAILED on Telegram API ok=false", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, description: "Bad Request" }),
      }),
    );
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toContain("TELEGRAM_API_ERROR");
  });

  it("returns FAILED on HTTP 400", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      }),
    );
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toContain("TELEGRAM_HTTP_400");
  });

  it("returns RETRYABLE_FAILURE on HTTP 429", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Too Many Requests"),
      }),
    );
    const result = await sendTelegramMessage(makeEvent());
    expect(result.status).toBe("RETRYABLE_FAILURE");
    expect(result.errorCode).toContain("TELEGRAM_HTTP_429");
  });

  it("returns RETRYABLE_FAILURE on HTTP 500", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = init.body as string;
        return { ok: true, json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }) };
      }),
    );
    await sendTelegramMessage(makeEvent());
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.text).toContain("Decision Changed");
    expect(parsed.text).toContain("NIFTY");
    expect(parsed.text).toContain("HIGH");
    expect(parsed.parse_mode).toBeUndefined();
  });

  it("message formatting is deterministic for same event", async () => {
    const event = makeEvent();
    // formatTelegramMessage is not exported, but we can verify via sendTelegramMessage
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        bodies.push((init as { body: string }).body);
        return { ok: true, json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }) };
      }),
    );
    await sendTelegramMessage(event);
    await sendTelegramMessage(event);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("null optional event fields are handled safely", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    let capturedBody: string | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        capturedBody = (init as { body: string }).body;
        return { ok: true, json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }) };
      }),
    );
    const event = makeEvent({
      instrument: null,
      previousState: null,
      currentState: null,
      evidence: [],
    });
    const result = await sendTelegramMessage(event);
    expect(result.status).toBe("DELIVERED");
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!);
    expect(parsed.text).toContain("Decision Changed");
    expect(parsed.text).toContain("Research Only");
  });
});

describe("telegram delivery provider", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...origEnv };
  });

  it("disabled subscription preference suppresses delivery", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    const { TelegramServerAlertDeliveryProvider } = await import("./telegram-delivery.server");
    const event = makeEvent();
    const sub = defaultSubscription("u1");
    const result = await TelegramServerAlertDeliveryProvider.deliver(
      event,
      sub,
      new Date().toISOString(),
    );
    expect(result.status).toBe("SKIPPED");
  });

  it("missing credentials returns DISABLED", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    const { TelegramServerAlertDeliveryProvider } = await import("./telegram-delivery.server");
    const event = makeEvent();
    const result = await TelegramServerAlertDeliveryProvider.deliver(
      event,
      { ...defaultSubscription("u1"), telegramEnabled: true },
      new Date().toISOString(),
    );
    expect(result.status).toBe("DISABLED");
    expect(result.errorCode).toBe("MISSING_TELEGRAM_CREDENTIALS");
  });

  it("both provider layers require explicit opt-in without making a request", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_CHAT_ID = "123";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { TelegramServerAlertDeliveryProvider } = await import("./telegram-delivery.server");
    for (const provider of [TelegramAlertDeliveryProvider, TelegramServerAlertDeliveryProvider]) {
      for (const sub of [null, defaultSubscription("u1")]) {
        expect((await provider.deliver(makeEvent(), sub, "2026-07-17T04:30:00.000Z")).status).toBe(
          "SKIPPED",
        );
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("telegram safety", () => {
  it("telegram-delivery.server.ts has no broker execution imports", () => {
    // Verify the module does not import order placement, broker, or trading APIs
    const filePath = resolve(__dirname, "telegram-delivery.server.ts");
    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toMatch(
      /placeOrder|modifyOrder|cancelOrder|broker|execute.*order|BUY.*order|SELL.*order/i,
    );
  });
});
