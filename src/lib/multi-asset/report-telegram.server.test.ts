import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverMorningBrief } from "./report-telegram.server";

const input = {
  reportId: "MB-2026-10-28-v44B.1",
  generatedAt: "2026-10-28T02:45:00.000Z",
  sections: [{ id: "A_HEADER", title: "", body: "Data quality: UNAVAILABLE" }],
} as const;

const token = "synthetic-telegram-token";
const chatId = "synthetic-chat-id";

beforeEach(() => {
  vi.stubEnv("TELEGRAM_ENABLED", "true");
  vi.stubEnv("TELEGRAM_MORNING_BRIEF_ENABLED", "true");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", token);
  vi.stubEnv("TELEGRAM_CHAT_ID", chatId);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deliverMorningBrief feature flags and outcomes", () => {
  it.each([
    ["TELEGRAM_ENABLED", "false", "TELEGRAM_DISABLED"],
    ["TELEGRAM_MORNING_BRIEF_ENABLED", "false", "TELEGRAM_MORNING_BRIEF_DISABLED"],
    ["TELEGRAM_ENABLED", "", "TELEGRAM_DISABLED"],
    ["TELEGRAM_MORNING_BRIEF_ENABLED", "invalid", "TELEGRAM_MORNING_BRIEF_DISABLED"],
  ])("does not send when %s is %s", async (key, value, reason) => {
    vi.stubEnv(key, value);
    vi.stubGlobal("fetch", vi.fn());

    const result = await deliverMorningBrief(input);

    expect(result).toMatchObject({ delivered: false, attempted: 0, errorCode: reason });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send when Telegram credentials are missing", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    vi.stubGlobal("fetch", vi.fn());

    const result = await deliverMorningBrief(input);

    expect(result).toMatchObject({
      delivered: false,
      attempted: 0,
      errorCode: "TELEGRAM_CREDENTIALS_UNCONFIGURED",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records successful Telegram delivery and message ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }),
        ),
    );

    const result = await deliverMorningBrief(input);

    expect(result).toMatchObject({
      delivered: true,
      attempted: 1,
      succeeded: 1,
      failed: 0,
      messageIds: [42],
    });
  });

  it("returns a safe error code for Telegram API and HTTP failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, error_code: 400, description: token }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(token, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const apiFailure = await deliverMorningBrief(input);
    const httpFailure = await deliverMorningBrief(input);

    expect(apiFailure.errorCode).toBe("TELEGRAM_API_400");
    expect(httpFailure.errorCode).toBe("TELEGRAM_HTTP_403");
    expect(JSON.stringify([apiFailure, httpFailure])).not.toContain(token);
    expect(JSON.stringify([apiFailure, httpFailure])).not.toContain(chatId);
  });

  it("does not expose credential-bearing network errors in outcomes or logs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`${token} ${chatId}`)));

    const result = await deliverMorningBrief(input);
    const logOutput = vi.mocked(console.warn).mock.calls.flat().join("");

    expect(result.errorCode).toBe("TELEGRAM_NETWORK_ERROR");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(chatId);
    expect(logOutput).not.toContain(token);
    expect(logOutput).not.toContain(chatId);
  });
});
