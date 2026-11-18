import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AlertDeliveryRow } from "./alert-delivery.functions";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, handler: (handler: unknown) => handler }; return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {}, assertAuth: (context: { userId?: string }) => { if (!context?.userId) throw new Error("Unauthorized"); } }));

const row: AlertDeliveryRow = { id: "ping-qa", event_id: null, fingerprint: "operator-ping-qa", provider: "TELEGRAM",
  status: "DELIVERED", error_code: null, retryable: false, duration_ms: 12, attempted_at: "2026-11-16T05:00:00Z",
  event: { title: "Operator Telegram Test Ping", type: "OPERATOR_PING", priority: "INFO" }, retry_count: 0, target_channel: "@qa_fixture" };
let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "eb-delivery-qa-")); vi.stubEnv("TELEGRAM_DELIVERY_AUDIT_PATH", join(directory, "audit.json")); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

describe("durable operator Telegram audit", () => {
  it("survives a module restart and remains user scoped", async () => {
    const { persistDeliveryAudit } = await import("./delivery-audit.server");
    await persistDeliveryAudit("qa-u1", row);
    vi.resetModules();
    const { readDeliveryAudit } = await import("./delivery-audit.server");
    expect(await readDeliveryAudit("qa-u1")).toEqual([row]);
    expect(await readDeliveryAudit("qa-u2")).toEqual([]);
  });
  it("shows the stored ping after a failing database read, without duplicate rows", async () => {
    const { persistOperatorDelivery, listAlertDeliveries } = await import("./alert-delivery.functions");
    expect(await persistOperatorDelivery(row, "guest-researcher")).toBe(true);
    const read = listAlertDeliveries as unknown as (args: unknown) => Promise<AlertDeliveryRow[]>;
    const supabase = { from: () => { throw new Error("database unavailable"); } };
    const rows = await read({ context: { userId: "guest-researcher", isGuest: true, supabase } });
    expect(rows.filter((entry) => entry.id === row.id)).toEqual([row]);
    expect(await read({ context: { userId: "other-user", supabase } })).toEqual([]);
  });
});
