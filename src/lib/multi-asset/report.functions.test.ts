import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  deliverMorningBrief: vi.fn(),
  getMorningBriefDeliveryDisabledReason: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from },
}));
vi.mock("./report-telegram.server", () => ({
  deliverMorningBrief: mocks.deliverMorningBrief,
  getMorningBriefDeliveryDisabledReason: mocks.getMorningBriefDeliveryDisabledReason,
}));

import { runMorningBrief } from "./report.functions";

const unavailableInstrument = (instrumentId: string, displayName: string) => ({
  instrumentId,
  displayName,
  bundle: null,
  bias: null,
  livePrice: null,
  status: "UNAVAILABLE" as const,
});

const payload = {
  reportId: "MB-2026-10-28-v44B.1",
  reportDate: "2026-10-28",
  generatedAt: "2026-10-28T02:45:00.000Z",
  panchang: null,
  nifty: unavailableInstrument("NIFTY", "NIFTY 50"),
  banknifty: unavailableInstrument("BANKNIFTY", "BANKNIFTY"),
  xauusd: unavailableInstrument("XAUUSD", "XAU/USD"),
  xagusd: unavailableInstrument("XAGUSD", "XAG/USD"),
  btc: unavailableInstrument("BTC", "Bitcoin"),
  eth: unavailableInstrument("ETH", "Ethereum"),
  ratio: {
    ratio: null,
    macroBias: "UNAVAILABLE",
    goldBias: "UNAVAILABLE",
    silverBias: "UNAVAILABLE",
    action: "WAIT",
    lowerThreshold: 55,
    upperThreshold: 80,
    normalizedGold: null,
    normalizedSilver: null,
    quoteCurrency: null,
    normalizationMethod: "UNAVAILABLE",
    freshness: "UNAVAILABLE",
    calculatedAt: "2026-10-28T02:45:00.000Z",
    goldSource: { price: null, timestamp: null, provider: null },
    silverSource: { price: null, timestamp: null, provider: null },
    reason: "Provider data unavailable in current build.",
    version: "MACRO_GS_RATIO_V44A",
  },
  indiaContext: {
    indiaVix: null,
    top5Bullish: [],
    top5Bearish: [],
    strongestSectors: [],
    weakestSectors: [],
    institutionalFlowProbability: null,
    marketStatus: "UNAVAILABLE",
    latestTradeDate: null,
    status: "UNAVAILABLE",
  },
  fiiDii: {
    tradeDate: null,
    fiiNet: null,
    diiNet: null,
    publicationStatus: "UNAVAILABLE",
    status: "UNAVAILABLE",
  },
  overallStatus: "PARTIAL",
} as const;

function reportRow(deliveryStatus: "PENDING" | "SENT" | "FAILED", deliveryAttempts: number) {
  return {
    id: "report-row",
    report_key: "test-report-key",
    report_date: "2026-10-28",
    report_type: "MORNING_BRIEF",
    timezone: "Asia/Kolkata",
    version: "morning-brief@44B.1",
    payload,
    data_quality: "PARTIAL",
    generated_at: "2026-10-28T02:45:00.000Z",
    delivery_status: deliveryStatus,
    delivery_error: null,
    delivery_attempts: deliveryAttempts,
    telegram_message_ids: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.getMorningBriefDeliveryDisabledReason.mockReturnValue(null);
});

describe("runMorningBrief idempotency", () => {
  it("does not redeliver an already successful report", async () => {
    const readQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: reportRow("SENT", 1), error: null }),
    };
    mocks.from.mockReturnValue(readQuery);

    const result = await runMorningBrief();

    expect(result.deliveryStatus).toBe("SENT");
    expect(result.deliveryAttempts).toBe(1);
    expect(mocks.from).toHaveBeenCalledOnce();
    expect(mocks.deliverMorningBrief).not.toHaveBeenCalled();
  });

  it("does not automatically repeat an ambiguous or failed delivery", async () => {
    const readQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: reportRow("FAILED", 1), error: null }),
    };
    mocks.from.mockReturnValue(readQuery);

    const result = await runMorningBrief();

    expect(result.deliveryStatus).toBe("FAILED");
    expect(result.deliveryAttempts).toBe(1);
    expect(mocks.deliverMorningBrief).not.toHaveBeenCalled();
  });

  it("persists a disabled delivery as pending without counting an HTTP attempt", async () => {
    const existing = reportRow("PENDING", 0);
    const readQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const deliveryUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { ...existing, delivery_error: "TELEGRAM_DISABLED" },
        error: null,
      }),
    };
    mocks.from.mockReturnValueOnce(readQuery).mockReturnValueOnce(deliveryUpdate);
    mocks.getMorningBriefDeliveryDisabledReason.mockReturnValue("TELEGRAM_DISABLED");
    mocks.deliverMorningBrief.mockResolvedValue({
      delivered: false,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      parts: [],
      messageIds: [],
      errorCode: "TELEGRAM_DISABLED",
    });

    const result = await runMorningBrief();
    const savedValues = deliveryUpdate.update.mock.calls[0][0];

    expect(result.deliveryStatus).toBe("PENDING");
    expect(result.deliveryAttempts).toBe(0);
    expect(savedValues.delivery_attempts).toBeUndefined();
    expect(savedValues.last_attempted_at).toBeUndefined();
    expect(savedValues.delivery_error).toBe("TELEGRAM_DISABLED");
  });

  it("claims a send once and persists its actual success", async () => {
    const existing = reportRow("PENDING", 0);
    const claimed = reportRow("PENDING", 1);
    const sent = { ...reportRow("SENT", 1), telegram_message_ids: [42] };
    const readQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const claimQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: claimed, error: null }),
    };
    const deliveryUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: sent, error: null }),
    };
    mocks.from
      .mockReturnValueOnce(readQuery)
      .mockReturnValueOnce(claimQuery)
      .mockReturnValueOnce(deliveryUpdate);
    mocks.deliverMorningBrief.mockResolvedValue({
      delivered: true,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      parts: [],
      messageIds: [42],
    });

    const result = await runMorningBrief();

    expect(result.deliveryStatus).toBe("SENT");
    expect(result.deliveryAttempts).toBe(1);
    expect(result.telegramMessageIds).toEqual([42]);
    expect(claimQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_attempts: 1, last_attempted_at: expect.any(String) }),
    );
    expect(mocks.deliverMorningBrief).toHaveBeenCalledOnce();
  });

  it("does not report delivery as persisted when the database update fails", async () => {
    const existing = reportRow("PENDING", 0);
    const readQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
    };
    const claimQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: reportRow("PENDING", 1),
        error: null,
      }),
    };
    const deliveryUpdate = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "synthetic persistence failure" },
      }),
    };
    mocks.from
      .mockReturnValueOnce(readQuery)
      .mockReturnValueOnce(claimQuery)
      .mockReturnValueOnce(deliveryUpdate);
    mocks.deliverMorningBrief.mockResolvedValue({
      delivered: true,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      parts: [],
      messageIds: [42],
    });

    await expect(runMorningBrief()).rejects.toThrow("morning_brief_delivery_persistence_failed");

    expect(mocks.deliverMorningBrief).toHaveBeenCalledOnce();
    expect(deliveryUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ delivery_status: "SENT", telegram_message_ids: [42] }),
    );
    expect(vi.mocked(console.error).mock.calls.flat().join("")).toContain(
      "MORNING_BRIEF_DELIVERY_PERSISTENCE_FAILED",
    );
  });
});
