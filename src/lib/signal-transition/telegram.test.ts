// Phase P1 — Signal Transition Telegram delivery tests.
// Uses mock fetch. Never calls real Telegram API. Never exposes real credentials.

import { describe, expect, it, beforeEach } from "vitest";
import {
  deliverSignalAlert,
  resetSignalTelegramDeliveryForTests,
  validateSignalAlertTelegramConfiguration,
} from "./telegram.server";
import type { SignalTransition } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_ENV = {
  TELEGRAM_BOT_TOKEN: "123456789:abcdefghijklmnopqrstuvwxyzABCDE",
  TELEGRAM_CHAT_ID: "-1001234567890",
  TELEGRAM_ENABLED: "true",
  TELEGRAM_MORNING_BRIEF_ENABLED: "true",
};

function makeSignal(overrides: Partial<SignalTransition> = {}): SignalTransition {
  return {
    id: "sig-test-1",
    key: {
      previous: "WAIT",
      current: "BUY",
      instrument: "NIFTY50",
      tradingDate: "2026-08-18",
      runId: "run-1",
    },
    previous: "WAIT",
    current: "BUY",
    instrument: "NIFTY50",
    price: 24350.75,
    confidence: 72,
    researchSummary: "Astro active. Gann UP.",
    runId: "run-1",
    tradingDate: "2026-08-18",
    timestamp: "2026-08-18T07:30:00.000Z",
    isDirectional: true,
    isTransition: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Configuration validation (Requirement F)
// ---------------------------------------------------------------------------

describe("signal alert Telegram configuration", () => {
  beforeEach(() => resetSignalTelegramDeliveryForTests());

  it("returns READY for valid configuration", () => {
    const c = validateSignalAlertTelegramConfiguration(VALID_ENV);
    expect(c.status).toBe("READY");
    expect(c.signalAlertsEnabled).toBe(true);
  });

  it("returns CONFIG_MISSING when bot token is empty", () => {
    const c = validateSignalAlertTelegramConfiguration({
      ...VALID_ENV,
      TELEGRAM_BOT_TOKEN: "",
    });
    expect(c.status).toBe("CONFIG_MISSING");
    expect(c.botToken).toBe("EMPTY");
  });

  it("returns CONFIG_MISSING when chat ID is invalid", () => {
    const c = validateSignalAlertTelegramConfiguration({
      ...VALID_ENV,
      TELEGRAM_CHAT_ID: "not-a-chat-id",
    });
    expect(c.status).toBe("CONFIG_MISSING");
    expect(c.chatId).toBe("INVALID_FORMAT");
  });

  it("respects TELEGRAM_SIGNAL_ALERTS_ENABLED=false", () => {
    const c = validateSignalAlertTelegramConfiguration({
      ...VALID_ENV,
      TELEGRAM_SIGNAL_ALERTS_ENABLED: "false",
    });
    expect(c.status).toBe("READY"); // base is ready
    expect(c.signalAlertsEnabled).toBe(false);
  });

  it("never exposes token or chat ID in validation output", () => {
    const c = validateSignalAlertTelegramConfiguration(VALID_ENV);
    const json = JSON.stringify(c);
    expect(json).not.toContain("123456789");
    expect(json).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(json).not.toContain("-1001234567890");
  });
});

// ---------------------------------------------------------------------------
// Delivery — successful (Requirement D, F)
// ---------------------------------------------------------------------------

describe("signal alert Telegram delivery", () => {
  beforeEach(() => resetSignalTelegramDeliveryForTests());

  it("delivers a signal transition message successfully", async () => {
    const result = await deliverSignalAlert({
      signal: makeSignal(),
      env: VALID_ENV,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.chat_id).toBe("-1001234567890");
        expect(body.text).toContain("EAGLEBABA ASTRO LEVELS");
        expect(body.text).toContain("SIGNAL: BUY");
        expect(body.parse_mode).toBe("HTML");
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 42 } }),
          { status: 200 },
        );
      },
    });
    expect(result.delivered).toBe(true);
    expect(result.status).toBe("DELIVERED");
    expect(result.messageId).toBe(42);
  });

  // Requirement E — Deduplication
  it("prevents duplicate delivery for the same transition", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: calls } }),
        { status: 200 },
      );
    };

    const r1 = await deliverSignalAlert({ signal: makeSignal(), env: VALID_ENV, fetchImpl });
    expect(r1.delivered).toBe(true);
    expect(calls).toBe(1);

    const r2 = await deliverSignalAlert({ signal: makeSignal(), env: VALID_ENV, fetchImpl });
    expect(r2.status).toBe("DUPLICATE");
    expect(calls).toBe(1); // No additional fetch call
  });

  // Requirement F — Missing configuration
  it("returns CONFIG_MISSING when Telegram config is missing", async () => {
    let calls = 0;
    const result = await deliverSignalAlert({
      signal: makeSignal(),
      env: {},
      fetchImpl: async () => { calls++; return new Response("{}"); },
    });
    expect(result.status).toBe("CONFIG_MISSING");
    expect(result.delivered).toBe(false);
    expect(calls).toBe(0); // No fetch attempted
  });

  // Requirement F — Failed delivery
  it("handles Telegram API failure with redacted error", async () => {
    const result = await deliverSignalAlert({
      signal: makeSignal(),
      env: VALID_ENV,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ ok: false, description: "bad token chat id authorization" }),
          { status: 401 },
        ),
    });
    expect(result.delivered).toBe(false);
    expect(result.status).toBe("FAILED");
    // Error message must not contain sensitive tokens
    expect(result.error).not.toMatch(/token|chat id|authorization/i);
  });

  // Requirement F — Skipped when signal alerts disabled
  it("returns SKIPPED when signal alerts are disabled", async () => {
    let calls = 0;
    const result = await deliverSignalAlert({
      signal: makeSignal(),
      env: { ...VALID_ENV, TELEGRAM_SIGNAL_ALERTS_ENABLED: "false" },
      fetchImpl: async () => { calls++; return new Response("{}"); },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.delivered).toBe(false);
    expect(calls).toBe(0);
  });

  // Requirement F — Network error
  it("handles network errors gracefully", async () => {
    const result = await deliverSignalAlert({
      signal: makeSignal(),
      env: VALID_ENV,
      fetchImpl: async () => { throw new Error("Network timeout"); },
    });
    expect(result.delivered).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("Network timeout");
  });

  // Requirement F — Overlapping delivery prevention
  it("prevents overlapping delivery for the same signal", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });

    const first = deliverSignalAlert({
      signal: makeSignal(),
      env: VALID_ENV,
      fetchImpl: async () => {
        await pending;
        return new Response(
          JSON.stringify({ ok: true, result: { message_id: 1 } }),
          { status: 200 },
        );
      },
    });

    const second = await deliverSignalAlert({
      signal: makeSignal(),
      env: VALID_ENV,
      fetchImpl: async () => new Response("{}"),
    });
    expect(second.status).toBe("SENDING");

    release();
    await first;
  });

  // Requirement F — Different signals can deliver independently
  it("allows independent delivery for different instruments", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: calls } }),
        { status: 200 },
      );
    };

    const r1 = await deliverSignalAlert({
      signal: makeSignal({ key: { previous: "WAIT", current: "BUY", instrument: "NIFTY50", tradingDate: "2026-08-18", runId: "run-1" } }),
      env: VALID_ENV,
      fetchImpl,
    });
    expect(r1.delivered).toBe(true);

    const r2 = await deliverSignalAlert({
      signal: makeSignal({ key: { previous: "WAIT", current: "SELL", instrument: "BANKNIFTY", tradingDate: "2026-08-18", runId: "run-1" } }),
      env: VALID_ENV,
      fetchImpl,
    });
    expect(r2.delivered).toBe(true);
    expect(calls).toBe(2);
  });
});
