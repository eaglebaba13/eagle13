import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertEvent, RuleEvaluationOutput } from "./types";
import { makeEmptyCheckpoint } from "./dedupe";

// Exercise the actual runner handler while replacing framework/DB boundaries.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: {},
  assertAuth: (context: { userId: string | null }) => {
    if (!context.userId) throw new Error("Unauthorized: Authentication required");
  },
}));
vi.mock("@/lib/decision.functions", () => ({ getDecisionSnapshot: async () => null }));
vi.mock("@/lib/gti-summary/gti-summary.functions", () => ({ getGtiSummary: async () => null }));
vi.mock("@/lib/gann-gap/gann-gap.functions", () => ({ getGannGapOutlook: async () => null }));
vi.mock("@/lib/option-strategy-terminal/terminal.functions", () => ({
  getOptionStrategyTerminal: async () => null,
}));
vi.mock("@/lib/ai-market-assistant/assistant.functions", () => ({
  getAiMarketAssistant: async () => null,
}));
vi.mock("./engine", () => ({ runAlertEngine: vi.fn() }));

import { runAlertEngine } from "./engine";
import {
  getAdminAlertDiagnostics,
  getSmartAlertSubscription,
  updateSmartAlertSubscription,
  getSmartAlertEvents,
  getSmartAlertUnreadCount,
  markSmartAlertRead,
  markSmartAlertDismissed,
  markAllSmartAlertsRead,
  runSmartAlerts,
  type AdminAlertDiagnostics,
  type SmartAlertRunResult,
} from "./persistence.functions";
import { listAlertDeliveries } from "../notifications/alert-delivery.functions";

type DbResult = { data: Record<string, unknown> | null; error: { message: string } | null };
const ok = (data: Record<string, unknown> | null = null): DbResult => ({ data, error: null });
const failure: DbResult = { data: null, error: { message: "untrusted database details" } };
const event: AlertEvent = {
  id: "test",
  fingerprint: "test-fingerprint",
  type: "DATA_STALE",
  category: "SYSTEM_HEALTH",
  priority: "LOW",
  title: "TEST ONLY",
  summary: "Mocked runner persistence test",
  instrument: null,
  previousState: null,
  currentState: null,
  evidence: [],
  sourceModules: [],
  freshness: "UNKNOWN",
  createdAt: "2026-07-17T04:30:00.000Z",
  tradingDate: "2026-07-17",
  expiresAt: null,
  researchOnly: true,
  disclaimer: "Research Only",
  rulesVersion: "1.0.0",
  deliveryStatus: [
    {
      provider: "TELEGRAM",
      status: "DELIVERED",
      retryable: false,
      errorCode: null,
      attemptedAt: "2026-07-17T04:30:00.000Z",
      fingerprint: "test-fingerprint",
    },
  ],
};

function database(
  overrides: Partial<
    Record<
      "checkpointRead" | "subscriptionRead" | "eventWrite" | "auditWrite" | "checkpointWrite",
      DbResult
    >
  > = {},
) {
  const results = {
    checkpointRead: ok(),
    subscriptionRead: ok(),
    eventWrite: ok({ id: "event-id" }),
    auditWrite: ok(),
    checkpointWrite: ok(),
    ...overrides,
  };
  const checkpointWrite = vi.fn(async (_row: Record<string, unknown>) => results.checkpointWrite);
  const auditWrite = vi.fn(async (_row: Record<string, unknown>) => results.auditWrite);
  const from = vi.fn((table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () =>
        table === "smart_alert_events"
          ? results.eventWrite
          : table === "smart_alert_subscriptions"
            ? results.subscriptionRead
            : results.checkpointRead,
      upsert: (row: Record<string, unknown>) =>
        table === "smart_alert_engine_checkpoints" ? checkpointWrite(row) : chain,
      insert: auditWrite,
    };
    return chain;
  });
  return { from, checkpointWrite, auditWrite };
}

const runner = runSmartAlerts as unknown as (args: {
  context: { userId: string | null; supabase: ReturnType<typeof database> | null };
}) => Promise<SmartAlertRunResult>;

describe("Smart Alert runner persistence boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const nextCheckpoint = makeEmptyCheckpoint("u1", event.createdAt);
    vi.mocked(runAlertEngine).mockResolvedValue({
      emitted: [event],
      suppressed: [],
      nextCheckpoint,
      diagnostics: {
        rulesEvaluated: 1,
        eventsGenerated: 1,
        eventsSuppressed: 0,
        fingerprintsCreated: 1,
        dedupeHits: 0,
        cooldownHits: 0,
        durationMs: 0,
        canonicalAvailability: {},
        rulesVersion: "1.0.0",
      },
    } as RuleEvaluationOutput);
  });

  it("rejects unauthenticated evaluation before database access or delivery", async () => {
    const db = database();
    await expect(runner({ context: { userId: null, supabase: db } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(db.from).not.toHaveBeenCalled();
    expect(runAlertEngine).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated Telegram Log access", async () => {
    const reader = listAlertDeliveries as unknown as typeof runner;
    const db = database();
    await expect(reader({ context: { userId: null, supabase: db } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(db.from).not.toHaveBeenCalled();
  });

  it.each([
    ["subscription read", getSmartAlertSubscription],
    ["subscription update", updateSmartAlertSubscription],
    ["event feed", getSmartAlertEvents],
    ["unread count", getSmartAlertUnreadCount],
    ["mark read", markSmartAlertRead],
    ["dismiss", markSmartAlertDismissed],
    ["mark all read", markAllSmartAlertsRead],
    ["admin diagnostics", getAdminAlertDiagnostics],
  ] as const)("rejects unauthenticated %s before database access", async (_name, handler) => {
    const db = database();
    const invoke = handler as unknown as typeof runner;
    await expect(invoke({ context: { userId: null, supabase: db } })).rejects.toThrow(
      "Unauthorized",
    );
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects non-admin diagnostics access before reading aggregate rows", async () => {
    const from = vi.fn();
    const supabase = { from, rpc: async () => ({ data: false }) };
    const invoke = getAdminAlertDiagnostics as unknown as (args: {
      context: { userId: string; supabase: typeof supabase };
    }) => Promise<AdminAlertDiagnostics>;
    await expect(invoke({ context: { userId: "not-admin", supabase } })).rejects.toThrow(
      "forbidden",
    );
    expect(from).not.toHaveBeenCalled();
  });

  it.each(["checkpointRead", "subscriptionRead"] as const)(
    "fails closed when %s fails",
    async (key) => {
      const db = database({ [key]: failure });
      await expect(runner({ context: { userId: "u1", supabase: db } })).rejects.toThrow(
        "READ_FAILED",
      );
      expect(runAlertEngine).not.toHaveBeenCalled();
      expect(db.checkpointWrite).not.toHaveBeenCalled();
    },
  );

  it("persists confirmed attempts and advances a successful checkpoint", async () => {
    const db = database();
    const result = await runner({ context: { userId: "u1", supabase: db } });
    expect(result.persistenceFailed).toBe(false);
    expect(result.emittedIds).toEqual(["event-id"]);
    expect(db.auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        event_id: "event-id",
        provider: "TELEGRAM",
        status: "DELIVERED",
      }),
    );
    expect(db.checkpointWrite).toHaveBeenCalledWith(
      expect.objectContaining({ last_error: null, fingerprints: expect.any(Object) }),
    );
  });

  it.each([failure, ok()])(
    "reports event failure without advancing fingerprints or writing orphan attempts",
    async (eventWrite) => {
      const db = database({ eventWrite });
      const result = await runner({ context: { userId: "u1", supabase: db } });
      expect(result.persistenceFailed).toBe(true);
      expect(result.persistenceError).toMatch(/SMART_ALERT_EVENT_/);
      expect(db.auditWrite).not.toHaveBeenCalled();
      expect(db.checkpointWrite.mock.calls[0][0]).not.toHaveProperty("fingerprints");
    },
  );

  it("reports audit failure but advances dedupe state for messages already sent", async () => {
    const db = database({ auditWrite: failure });
    const result = await runner({ context: { userId: "u1", supabase: db } });
    expect(result.persistenceError).toBe("SMART_ALERT_DELIVERY_AUDIT_WRITE_FAILED");
    expect(result.persistenceFailed).toBe(true);
    const row = db.checkpointWrite.mock.calls[0][0];
    expect(row).toHaveProperty("fingerprints");
    expect(row).not.toHaveProperty("last_success_at");
    expect(row.last_error).toBe(result.persistenceError);
  });

  it("reports a failed checkpoint write instead of claiming persistence succeeded", async () => {
    const db = database({ checkpointWrite: failure });
    const result = await runner({ context: { userId: "u1", supabase: db } });
    expect(result.persistenceFailed).toBe(true);
    expect(result.persistenceError).toBe("SMART_ALERT_CHECKPOINT_WRITE_FAILED");
  });

  it("admin diagnostics count failed/retry attempts without counting delivery or opt-out", async () => {
    const statuses = ["DELIVERED", "FAILED", "SKIPPED", "DISABLED", "RETRY"];
    const from = (table: string) => {
      let count = table === "smart_alert_delivery_attempts" ? statuses.length : 0;
      const chain = {
        select: () => chain,
        is: () => chain,
        gte: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        in: (_column: string, values: string[]) => {
          count = statuses.filter((status) => values.includes(status)).length;
          return chain;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (result: { data: unknown[]; count: number; error: null }) => unknown) =>
          Promise.resolve({ data: [], count, error: null }).then(resolve),
      };
      return chain;
    };
    const supabase = { from, rpc: async () => ({ data: true }) };
    const diagnostics = getAdminAlertDiagnostics as unknown as (args: {
      context: { userId: string; supabase: typeof supabase };
    }) => Promise<AdminAlertDiagnostics>;
    const result = await diagnostics({ context: { userId: "admin-test", supabase } });
    expect(result.deliveryAttempts).toBe(5);
    expect(result.deliveryFailures).toBe(2);
  });
});
