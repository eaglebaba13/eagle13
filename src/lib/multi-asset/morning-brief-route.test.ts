import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runMorningBrief: vi.fn(),
}));

vi.mock("@/lib/multi-asset/report.functions", () => ({
  runMorningBrief: mocks.runMorningBrief,
}));

import { handleMorningBriefRequest } from "@/routes/api/public/hooks/morning-brief";

const schedulerSecret = "a".repeat(64);

function requestWithSecret(secret: string): Request {
  return new Request("https://test.invalid/api/public/hooks/morning-brief", {
    method: "POST",
    headers: { "x-morning-brief-secret": secret },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MORNING_BRIEF_CRON_SECRET", schedulerSecret);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.runMorningBrief.mockResolvedValue({
    payload: { reportId: "MB-2026-10-28-v44B.1" },
    dataQuality: "PARTIAL",
    deliveryStatus: "SENT",
    deliveryAttempts: 1,
    telegramMessageIds: [1],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Morning Brief scheduler hook authentication", () => {
  it("accepts a valid dedicated secret and reports delivery/data-quality status", async () => {
    const response = await handleMorningBriefRequest(requestWithSecret(schedulerSecret));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      dataQuality: "PARTIAL",
      deliveryStatus: "SENT",
      deliveryAttempts: 1,
    });
    expect(mocks.runMorningBrief).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["malformed", "bad secret"],
    ["incorrect", "b".repeat(64)],
  ])("rejects a %s request secret without running the report", async (_name, secret) => {
    const request = new Request("https://test.invalid/api/public/hooks/morning-brief", {
      method: "POST",
      ...(secret === undefined ? {} : { headers: { "x-morning-brief-secret": secret } }),
    });

    const response = await handleMorningBriefRequest(request);
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).not.toContain(schedulerSecret);
    expect(mocks.runMorningBrief).not.toHaveBeenCalled();
  });

  it("fails closed with an actionable response when the server secret is missing", async () => {
    vi.stubEnv("MORNING_BRIEF_CRON_SECRET", "");

    const response = await handleMorningBriefRequest(requestWithSecret(schedulerSecret));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "scheduler_auth_not_configured",
    });
    expect(mocks.runMorningBrief).not.toHaveBeenCalled();
  });

  it("does not expose internal errors in responses or logs", async () => {
    mocks.runMorningBrief.mockRejectedValue(new Error(`sensitive ${schedulerSecret}`));

    const response = await handleMorningBriefRequest(requestWithSecret(schedulerSecret));
    const output = `${await response.text()}${vi.mocked(console.error).mock.calls.flat().join("")}`;

    expect(response.status).toBe(500);
    expect(output).not.toContain(schedulerSecret);
    expect(output).not.toContain("sensitive");
  });
});
