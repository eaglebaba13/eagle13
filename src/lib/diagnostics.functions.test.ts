import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toCrossJSONAsync } from "seroval";
import { runWithStartContext, type StartStorageContext } from "@tanstack/start-storage-context";

const mocks = vi.hoisted(() => ({
  request: new Request("https://test.invalid"),
  claims: vi.fn(),
  rpc: vi.fn(),
  client: vi.fn(),
}));

vi.mock("@tanstack/start-storage-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/start-storage-context")>();
  return {
    ...actual,
    getStartContext: () => ({
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      request: mocks.request,
    }),
  };
});
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => mocks.request }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));

// Vitest has no Start compiler plugin. Adapt only its documented-in-source
// two-argument compiled handler ABI. Keep the real builder, middleware objects,
// flattening, context merging, next() and __executeServer error propagation.
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    createServerFn: (...args: Parameters<typeof actual.createServerFn>) => {
      const builder = actual.createServerFn(...args);
      const middleware = builder.middleware.bind(builder);
      builder.middleware = ((...middlewareArgs: Parameters<typeof middleware>) => {
        const configured = middleware(...middlewareArgs);
        const handler = configured.handler.bind(configured);
        configured.handler = ((fn: unknown) => {
          const extracted = Object.assign(async () => undefined, {
            serverFnMeta: {
              id: "diagnostics-test",
              name: "getServerDiagnostics",
              filename: "test",
            },
          });
          return (handler as unknown as (stub: unknown, server: unknown) => unknown)(extracted, fn);
        }) as typeof configured.handler;
        return configured;
      }) as typeof builder.middleware;
      return builder;
    },
  };
});

vi.mock("./server-cache", () => ({ getCacheMetrics: vi.fn() }));
vi.mock("./diagnostics", () => ({
  getApiHealth: vi.fn(),
  getApiLog: vi.fn(),
  getApiTotals: vi.fn(),
  getErrorLog: vi.fn(),
}));

import { getServerDiagnostics, type ServerDiagnostics } from "./diagnostics.functions";
import { getCacheMetrics } from "./server-cache";
import { getApiHealth, getApiLog, getApiTotals, getErrorLog } from "./diagnostics";
import { assertAuth, type AuthContext } from "@/integrations/supabase/auth-middleware";

const collectors = [getCacheMetrics, getApiHealth, getApiLog, getApiTotals, getErrorLog];
const sensitive = "secret-canary https://internal.invalid/token?credential=secret-canary";
const execute = () =>
  runWithStartContext(
    {
      getRouter: async () => {
        throw new Error("Router access is not expected in server-function tests");
      },
      request: mocks.request,
      startOptions: {},
      contextAfterGlobalMiddlewares: {},
      executedRequestMiddlewares: new Set(),
      handlerType: "serverFn",
    } satisfies StartStorageContext,
    async () => {
      return await (
        getServerDiagnostics as unknown as {
          __executeServer: (options: { method: "GET"; context: object }) => Promise<{
            result?: ServerDiagnostics;
            error?: unknown;
          }>;
        }
      ).__executeServer({ method: "GET", context: {} });
    },
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "synthetic-test-key");
  mocks.request = new Request("https://test.invalid", {
    headers: { authorization: "Bearer synthetic.test.token" },
  });
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "admin-test" } } });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.client.mockReturnValue({ auth: { getClaims: mocks.claims }, rpc: mocks.rpc });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected external request");
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function expectDenied() {
  const response = await execute();
  expect(response.result).toBeUndefined();
  expect(response.error).toBeInstanceOf(Error);
  expect((response.error as Error).message).toBe("Diagnostics unavailable");
  expect((response.error as Error).stack).toBeUndefined();
  expect((response.error as Error).cause).toBeUndefined();
  for (const collector of collectors) expect(collector).not.toHaveBeenCalled();
  // Same serializer primitive used by the locked Start server handler. This
  // is serialization coverage, NOT a generated-route HTTP integration test.
  const serialized = JSON.stringify(await toCrossJSONAsync(response.error, { refs: new Map() }));
  expect(serialized).toContain("Diagnostics unavailable");
  expect(serialized).not.toMatch(/secret-canary|internal\.invalid|synthetic\.test\.token/);
}

describe("diagnostics real middleware composition", () => {
  it("denies anonymous requests", async () => {
    mocks.request = new Request("https://test.invalid");
    await expectDenied();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it.each(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"])("denies missing %s", async (key) => {
    vi.stubEnv(key, "");
    await expectDenied();
  });

  it.each(["Bearer malformed", "Basic synthetic", "Bearer "])(
    "denies malformed auth %s",
    async (header) => {
      mocks.request = new Request("https://test.invalid", { headers: { authorization: header } });
      await expectDenied();
    },
  );

  it.each([
    null,
    { claims: null },
    { claims: {} },
    { claims: { sub: "" } },
    { claims: { sub: 123 } },
  ])("denies unverified/expired identity %j", async (data) => {
    mocks.claims.mockResolvedValue({ data });
    await expectDenied();
  });

  it("sanitizes claim verification exceptions", async () => {
    mocks.claims.mockRejectedValue(new Error(sensitive));
    await expectDenied();
  });

  it("sanitizes client construction exceptions", async () => {
    mocks.client.mockImplementation(() => {
      throw new Error(sensitive);
    });
    await expectDenied();
  });

  it("denies a missing client", async () => {
    mocks.client.mockReturnValue(null);
    await expectDenied();
  });

  it.each([false, null, undefined, "true", 1, {}, []])(
    "denies non-boolean role %j",
    async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      await expectDenied();
    },
  );

  it.each([null, undefined, {}, { data: true }, { data: true, error: { message: sensitive } }])(
    "denies malformed/error RPC result %j",
    async (role) => {
      mocks.rpc.mockResolvedValue(role);
      await expectDenied();
    },
  );

  it("sanitizes thrown RPC errors", async () => {
    mocks.rpc.mockRejectedValue(new Error(sensitive));
    await expectDenied();
  });

  it("preserves the baseline assertion requirement for identity, client and claims", () => {
    for (const context of [
      { userId: null, supabase: null, claims: null },
      { userId: "user", supabase: null, claims: null },
      { userId: "user", supabase: null, claims: { sub: "user" } },
      { userId: "user", supabase: {}, claims: null },
      { userId: null, supabase: {}, claims: { sub: "user" } },
    ])
      expect(() => assertAuth(context as AuthContext)).toThrow("Unauthorized");
    for (const collector of collectors) expect(collector).not.toHaveBeenCalled();
  });

  it("does not collect while role authorization is still pending", async () => {
    let resolveRole!: (value: { data: boolean; error: null }) => void;
    mocks.rpc.mockReturnValue(
      new Promise((resolve) => {
        resolveRole = resolve;
      }),
    );
    const pending = execute();
    await vi.waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    for (const collector of collectors) expect(collector).not.toHaveBeenCalled();
    resolveRole({ data: false, error: null });
    const response = await pending;
    expect((response.error as Error).message).toBe("Diagnostics unavailable");
    for (const collector of collectors) expect(collector).not.toHaveBeenCalled();
  });

  it("sanitizes collector exceptions after successful authorization", async () => {
    vi.mocked(getCacheMetrics).mockImplementation(() => {
      throw new Error(sensitive);
    });
    const response = await execute();
    expect(response.result).toBeUndefined();
    expect((response.error as Error).message).toBe("Diagnostics unavailable");
    expect((response.error as Error).stack).toBeUndefined();
    expect(getApiLog).not.toHaveBeenCalled();
  });

  it("authorizes before collection and preserves metrics while redacting sensitive text", async () => {
    const totals = {
      keys: 1,
      entries: 1,
      inFlight: 0,
      hits: 2,
      staleHits: 0,
      misses: 1,
      refreshes: 1,
      errors: 0,
      hitRate: 67,
    };
    vi.mocked(getCacheMetrics).mockReturnValue({
      totals,
      keys: [
        {
          key: sensitive,
          hits: 2,
          staleHits: 0,
          misses: 1,
          refreshes: 1,
          errors: 0,
          lastRefreshMs: 1,
          hasEntry: true,
          freshUntil: 2,
          staleUntil: 3,
          ttlRemainingMs: 1,
          inFlight: false,
          ageMs: 1,
          hitRate: 67,
        },
      ],
    });
    vi.mocked(getApiTotals).mockReturnValue({
      total: 1,
      ok: 0,
      failed: 1,
      retries: 0,
      totalMs: 10,
      avgMs: 10,
      errorRate: 100,
    });
    vi.mocked(getApiHealth).mockReturnValue([
      {
        host: sensitive,
        total: 1,
        ok: 0,
        failed: 1,
        retries: 0,
        avgMs: 10,
        errorRate: 100,
        lastStatus: 500,
        lastSuccessTs: null,
        lastFailureTs: 1,
        lastError: sensitive,
      },
    ]);
    vi.mocked(getApiLog).mockReturnValue([
      {
        ts: 1,
        host: sensitive,
        url: sensitive,
        method: "GET",
        status: 500,
        durationMs: 10,
        retries: 0,
        ok: false,
        error: sensitive,
      },
    ]);
    vi.mocked(getErrorLog).mockReturnValue([
      { ts: 1, severity: "error", message: sensitive, source: sensitive, stack: sensitive },
    ]);
    const response = await execute();
    expect(response.error).toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("has_role", { _user_id: "admin-test", _role: "admin" });
    for (const collector of collectors) {
      expect(collector).toHaveBeenCalledTimes(1);
      expect(vi.mocked(collector).mock.invocationCallOrder[0]).toBeGreaterThan(
        mocks.rpc.mock.invocationCallOrder[0],
      );
    }
    expect(Object.keys(response.result ?? {}).sort()).toEqual([
      "api",
      "cache",
      "errors",
      "formulaVersion",
      "isDev",
      "ts",
    ]);
    expect(response.result?.cache.totals).toEqual(totals);
    expect(response.result?.formulaVersion.unversionedCacheEntries).toBe(1);
    expect(typeof response.result?.ts).toBe("number");
    expect(typeof response.result?.isDev).toBe("boolean");
    expect(JSON.stringify(response.result)).not.toContain("secret-canary");
    expect(response.result?.errors[0].stack).toBe("[REDACTED]");
  });
});
