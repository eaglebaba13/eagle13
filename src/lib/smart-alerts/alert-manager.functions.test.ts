import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), load: vi.fn(), save: vi.fn(), dispatch: vi.fn(), report: vi.fn(), audit: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (input: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => unknown) => async (data: unknown) => handler({ data: validate(data) }),
    }),
  }),
}));
vi.mock("../auth/admin-auth.server", () => ({ requireStrictSuperadmin: mocks.auth }));
vi.mock("./modular-alerts.server", () => ({
  loadModularAlertSettings: mocks.load, saveModularAlertSettings: mocks.save, testModularAlert: mocks.dispatch,
}));
vi.mock("../market-data/fo-ban-tracker.server", () => ({ getFoBanTrackerReport: mocks.report }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ order: () => ({ limit: mocks.audit }) }) }) },
}));

import { getAlertManager, testAlertJob, updateAlertJob } from "./alert-manager.functions";
const call = (handler: unknown, data: unknown) => (handler as (input: unknown) => Promise<unknown>)(data);
const settings = { id: "nifty", enabled: true, schedule: "09:30", cooldownMinutes: 10 };

describe("alert manager handlers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ userId: "operator" });
    mocks.load.mockResolvedValue([{ ...settings }]);
    mocks.report.mockResolvedValue({ fetchedAt: "2026-11-19T01:00:00Z", allMap: { TEST: { status: "UNVERIFIED" } } });
    mocks.audit.mockResolvedValue({ error: null, data: [{ job: "nifty", status: "DELIVERED", claimed_at: "now", fingerprint: "test:key" }] });
  });

  it("returns persisted jobs, exclusion status and test audit entries", async () => {
    await expect(call(getAlertManager, {})).resolves.toMatchObject({
      jobs: [settings], tracked: 1,
      excluded: [{ symbol: "TEST", verifiedLive: false }],
      audit: [{ job: "nifty", status: "DELIVERED", test: true }],
    });
  });

  it("validates and persists only supported settings", async () => {
    await expect(call(updateAlertJob, { ...settings, schedule: "27:00" })).rejects.toThrow();
    await expect(call(updateAlertJob, { ...settings, id: "unknown" })).rejects.toThrow();
    expect(mocks.save).not.toHaveBeenCalled();
    await expect(call(updateAlertJob, settings)).resolves.toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith("nifty", settings);
  });

  it("uses the authenticated actor for test delivery", async () => {
    mocks.dispatch.mockResolvedValue({ status: "DELIVERED" });
    await expect(call(testAlertJob, { id: "nifty", userId: "client-supplied" })).resolves.toEqual({ status: "DELIVERED" });
    expect(mocks.dispatch).toHaveBeenCalledWith("operator", "nifty");
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("rejects %s before any read, write or dispatch", async (error) => {
    mocks.auth.mockRejectedValue(new Error(error));
    await expect(call(getAlertManager, {})).rejects.toThrow(error);
    await expect(call(updateAlertJob, settings)).rejects.toThrow(error);
    await expect(call(testAlertJob, { id: "nifty" })).rejects.toThrow(error);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
