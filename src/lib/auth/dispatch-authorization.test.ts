import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ request: vi.fn(), user: vi.fn() }));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  const builder = {
    middleware: () => builder,
    validator: () => builder,
    inputValidator: () => builder,
    handler: (handler: unknown) => handler,
  };
  return { ...actual, createServerFn: () => builder, createServerOnlyFn: (fn: unknown) => fn };
});
vi.mock("@tanstack/react-start/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-start/server")>(),
  getRequest: auth.request,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: auth.user },
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ role: "admin" }], error: null }) }) }),
  },
}));

import { notifyPriceAlertCreated } from "../market-data/crypto-tickers.functions";
import { dispatchFoBanAlertNow } from "../market-data/fo-ban.functions";
import { retryMorningBriefDelivery } from "../multi-asset/report.functions";
import { testTelegramChannelAdmin } from "../admin/telegram-manager.functions";
import {
  dispatchVolumeProfileAlert, dispatchVWAPAlert, runSmartAlerts, sendTelegramTestPing,
} from "../smart-alerts/persistence.functions";

describe("manual Telegram dispatch authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user.mockResolvedValue({ data: { user: { id: "ordinary-admin", app_metadata: {} } }, error: null });
  });

  it.each([
    ["price alert", notifyPriceAlertCreated as unknown],
    ["F&O ban", dispatchFoBanAlertNow as unknown],
    ["morning brief retry", retryMorningBriefDelivery as unknown],
    ["channel ping", testTelegramChannelAdmin as unknown],
    ["test ping", sendTelegramTestPing as unknown],
    ["Volume Profile", dispatchVolumeProfileAlert as unknown],
    ["VWAP", dispatchVWAPAlert as unknown],
    ["smart-alert evaluation with delivery", runSmartAlerts as unknown],
  ] as const)("rejects missing credentials and ordinary admins for %s", async (_name, endpoint) => {
    const handler = endpoint as (args: unknown) => Promise<unknown>;
    const args = {
      data: { id: "channel", telegramEnabled: true },
      context: { userId: "ordinary-admin", supabase: {}, claims: { sub: "ordinary-admin" } },
    };
    auth.request.mockReturnValue(new Request("http://localhost"));
    await expect(handler(args)).rejects.toThrow("UNAUTHORIZED_SUPERADMIN_REQUIRED");
    auth.request.mockReturnValue(new Request("http://localhost", { headers: { authorization: "Bearer test-token" } }));
    await expect(handler(args)).rejects.toThrow("FORBIDDEN_ACCESS_DENIED");
  });
});
