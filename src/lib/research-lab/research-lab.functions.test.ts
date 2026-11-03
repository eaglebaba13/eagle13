import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => {
  const chain = (): unknown => ({
    middleware: () => chain(),
    validator: () => chain(),
    inputValidator: () => chain(),
    handler: (fn: unknown) => fn,
  });
  return { createServerFn: () => chain() };
});

const { assertAuthMock } = vi.hoisted(() => ({ assertAuthMock: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: "requireSupabaseAuth",
  assertAuth: assertAuthMock,
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import * as dataset from "./dataset";
import { listRuns, recordFailure, saveRun, type ResearchLabAdminSnapshot } from "./persistence";
import { compareRuns, exportCsv, exportJson } from "./report";
import {
  compareResearchRuns,
  createResearchRun,
  exportResearchRunCsv,
  exportResearchRunJson,
  getResearchLabDiagnostics,
  listResearchRuns,
  readResearchRun,
  runResearchNow,
} from "./research-lab.functions";
import type { ResearchRunReport } from "./types";

type TestClient = SupabaseClient<Database>;
type TestContext = { readonly userId: string | null; readonly supabase: TestClient | null };
type Result = { readonly data: unknown; readonly error: { readonly code: string } | null };
type RunRow = {
  readonly run_id: string;
  readonly owner_id: string;
  readonly report: ResearchRunReport;
  readonly duration_ms: number | null;
  readonly created_at: string;
};
type FailureRow = { readonly owner_id: string; readonly created_at: string };
type AdminSnapshotRow = {
  readonly run_id: string | null;
  readonly run_report: ResearchRunReport | null;
  readonly duration_ms: number | null;
  readonly created_at: string | null;
  readonly failed_runs: number;
  readonly last_failure_at: string | null;
  readonly average_duration_ms: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class FakeQuery {
  private operation: "select" | "insert" = "select";
  private filters: [string, unknown][] = [];
  private ordering: { column: string; ascending: boolean }[] = [];
  private payload: unknown;
  private single = false;

  constructor(
    private readonly database: FakeDatabase,
    private readonly userId: string | null,
    private readonly table: string,
  ) {}

  select(): this {
    this.operation = "select";
    return this;
  }

  insert(payload: unknown): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options: { ascending: boolean }): this {
    this.ordering.push({ column, ascending: options.ascending });
    return this;
  }

  maybeSingle(): this {
    this.single = true;
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): Result {
    const injectedError = this.database.takeError(`${this.table}.${this.operation}`);
    if (injectedError) return { data: null, error: { code: injectedError } };

    if (this.operation === "insert") {
      if (!this.userId || !isRecord(this.payload)) {
        return { data: null, error: { code: "42501" } };
      }
      if (this.table === "research_lab_runs") {
        const row = this.payload as Partial<RunRow>;
        if (row.owner_id !== this.userId || !row.report || typeof row.run_id !== "string") {
          return { data: null, error: { code: "42501" } };
        }
        if (this.database.runs.some((item) => item.run_id === row.run_id)) {
          return { data: null, error: { code: "23505" } };
        }
        this.database.runs.push({
          run_id: row.run_id,
          owner_id: row.owner_id,
          report: row.report,
          duration_ms: row.duration_ms ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        });
        return { data: null, error: null };
      }
      return { data: null, error: { code: "42P01" } };
    }

    if (this.table !== "research_lab_runs" || !this.userId) {
      return { data: this.single ? null : [], error: null };
    }
    let rows = this.database.runs.filter((row) => row.owner_id === this.userId);
    for (const [column, value] of this.filters) {
      rows = rows.filter((row) => row[column as keyof RunRow] === value);
    }
    rows = [...rows].sort((a, b) => {
      for (const { column, ascending } of this.ordering) {
        const comparison = String(a[column as keyof RunRow]).localeCompare(
          String(b[column as keyof RunRow]),
        );
        if (comparison !== 0) return ascending ? comparison : -comparison;
      }
      return 0;
    });
    return { data: this.single ? (rows[0] ?? null) : rows, error: null };
  }
}

class FakeDatabase {
  readonly runs: RunRow[] = [];
  readonly failures: FailureRow[] = [];
  readonly calls: string[] = [];
  readonly injectedErrors = new Map<string, string>();
  sequence = 8640000000000000n;

  takeError(operation: string): string | undefined {
    const error = this.injectedErrors.get(operation);
    this.injectedErrors.delete(operation);
    return error;
  }

  client(userId: string | null): TestClient {
    const value = {
      from: (table: string) => new FakeQuery(this, userId, table),
      rpc: (name: string, args?: unknown) => this.rpc(userId, name, args),
    };
    return value as unknown as TestClient;
  }

  private async rpc(userId: string | null, name: string, args?: unknown): Promise<Result> {
    this.calls.push(`rpc:${name}:${userId ?? "anonymous"}`);
    const injectedError = this.takeError(`rpc.${name}`);
    if (injectedError) return { data: null, error: { code: injectedError } };
    if (name === "allocate_research_lab_run_id") {
      if (!userId) return { data: null, error: { code: "42501" } };
      this.sequence += 1n;
      return { data: this.sequence.toString(), error: null };
    }
    if (name === "record_research_lab_failure") {
      if (!userId || !isRecord(args) || args.p_owner_id !== userId) {
        return { data: null, error: { code: "42501" } };
      }
      this.failures.push({ owner_id: userId, created_at: new Date().toISOString() });
      return { data: null, error: null };
    }
    if (name === "has_role") return { data: userId === "admin", error: null };
    if (name === "research_lab_admin_snapshot") {
      if (userId !== "admin") return { data: null, error: { code: "42501" } };
      const sorted = [...this.runs].sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.run_id.localeCompare(b.run_id),
      );
      const snapshot: ResearchLabAdminSnapshot = {
        reports: sorted.map((row) => row.report),
        failedRuns: this.failures.length,
        lastFailureAt:
          this.failures
            .map((row) => row.created_at)
            .sort()
            .at(-1) ?? null,
        averageDurationMs:
          this.runs.filter((row) => row.duration_ms !== null).length > 0
            ? this.runs.reduce((sum, row) => sum + (row.duration_ms ?? 0), 0) /
              this.runs.filter((row) => row.duration_ms !== null).length
            : null,
      };
      const rows: AdminSnapshotRow[] = sorted.map((row) => ({
        run_id: row.run_id,
        run_report: row.report,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
        failed_runs: snapshot.failedRuns,
        last_failure_at: snapshot.lastFailureAt,
        average_duration_ms: snapshot.averageDurationMs,
      }));
      if (rows.length === 0) {
        rows.push({
          run_id: null,
          run_report: null,
          duration_ms: null,
          created_at: null,
          failed_runs: snapshot.failedRuns,
          last_failure_at: snapshot.lastFailureAt,
          average_duration_ms: snapshot.averageDurationMs,
        });
      }
      return { data: rows, error: null };
    }
    return { data: null, error: { code: "42883" } };
  }
}

const researchInput = {
  datasetId: "nifty-close-fixture",
  symbol: "NIFTY",
  timezone: "Asia/Kolkata",
  rows: [
    {
      symbol: "NIFTY",
      sessionDate: "2026-10-12",
      weekday: 1,
      month: 10,
      timestamp: "2026-10-12T10:00:00Z",
      open: 25100,
      high: 25200,
      low: 25050,
      close: 25180,
      previousClose: 25090,
      volume: 120000,
      vix: 14.2,
      pcr: 1.1,
      breadth: 320,
      gti: null,
      decision: null,
      gannGap: null,
      smartAlerts: [],
      institutionalFlow: null,
      providerAlias: "offline-test",
      providerTimestamp: null,
      formulaVersions: {},
      qualityFlags: [],
    },
  ],
};

const now = "2026-10-14T10:00:00.000Z";
const nowMs = Date.parse(now);
function realishAssertAuth(context: { readonly userId: string | null }): void {
  if (!context.userId) throw new Error("Unauthorized: Authentication required");
}

const ownerContext = (database: FakeDatabase, userId: string | null): TestContext => ({
  userId,
  supabase: database.client(userId),
});
const call = (fn: unknown) => fn as (arg: unknown) => Promise<unknown>;
const decodeBase36 = (value: string): bigint =>
  [...value].reduce((total, char) => total * 36n + BigInt(parseInt(char, 36)), 0n);

let database: FakeDatabase;
let adminContext: TestContext;
let userA: TestContext;
let userB: TestContext;

describe("Research Lab durable persistence and authorization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    database = new FakeDatabase();
    adminContext = ownerContext(database, "admin");
    userA = ownerContext(database, "user-a");
    userB = ownerContext(database, "user-b");
    assertAuthMock.mockReset().mockImplementation(realishAssertAuth);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function create(
    context: TestContext,
    datasetId = researchInput.datasetId,
  ): Promise<ResearchRunReport> {
    return (await call(createResearchRun)({
      context,
      data: { ...researchInput, datasetId },
    })) as ResearchRunReport;
  }

  it("rejects anonymous calls before touching the database", async () => {
    const anonymous = ownerContext(database, null);
    const protectedReads = [
      [listResearchRuns, {}],
      [readResearchRun, { runId: "missing" }],
      [compareResearchRuns, { runIdA: "a", runIdB: "b" }],
      [exportResearchRunJson, { runId: "missing" }],
      [exportResearchRunCsv, { runId: "missing" }],
      [getResearchLabDiagnostics, {}],
      [createResearchRun, researchInput],
    ] as const;
    for (const [fn, data] of protectedReads) {
      await expect(call(fn)({ context: anonymous, data })).rejects.toThrow("Unauthorized");
    }
    expect(database.calls).toEqual([]);
    expect(database.runs).toEqual([]);
  });

  it("persists the unchanged analytical report and returns the existing Run ID format", async () => {
    const expected = runResearchNow(researchInput, now);
    const result = await create(userA);
    const expectedRunId = `RESEARCH_RUN_${decodeBase36(
      result.manifest.runId.slice("RESEARCH_RUN_".length),
    ).toString(36)}`;
    expect(result).toMatchObject({
      ...expected,
      manifest: { ...expected.manifest, runId: expectedRunId },
    });
    expect(database.runs).toHaveLength(1);
    expect(database.runs[0]).toMatchObject({
      run_id: result.manifest.runId,
      owner_id: "user-a",
      report: result,
      duration_ms: expect.any(Number),
    });
  });

  it("preserves owner-scoped list, read, compare, and export contracts", async () => {
    const first = await create(userA, "first");
    const second = await create(userA, "second");
    const foreign = await create(userB, "foreign");
    expect(await call(listResearchRuns)({ context: userA })).toEqual([first, second]);
    expect(
      await call(readResearchRun)({
        context: userA,
        data: { runId: first.manifest.runId },
      }),
    ).toEqual(first);
    expect(
      await call(readResearchRun)({
        context: userA,
        data: { runId: foreign.manifest.runId },
      }),
    ).toBeNull();
    expect(
      await call(compareResearchRuns)({
        context: userA,
        data: { runIdA: first.manifest.runId, runIdB: second.manifest.runId },
      }),
    ).toEqual(compareRuns(first, second));
    expect(
      await call(compareResearchRuns)({
        context: userA,
        data: { runIdA: first.manifest.runId, runIdB: foreign.manifest.runId },
      }),
    ).toBeNull();
    expect(
      await call(exportResearchRunJson)({
        context: userA,
        data: { runId: first.manifest.runId },
      }),
    ).toBe(exportJson(first));
    expect(
      await call(exportResearchRunCsv)({
        context: userA,
        data: { runId: first.manifest.runId },
      }),
    ).toBe(exportCsv(first));
    expect(
      await call(exportResearchRunJson)({
        context: userA,
        data: { runId: foreign.manifest.runId },
      }),
    ).toBe("");
  });

  it("keeps historical timestamp-format Run IDs readable", async () => {
    const legacy = runResearchNow(researchInput, now);
    await saveRun(database.client("user-a"), legacy, "user-a");
    expect(
      await call(readResearchRun)({
        context: userA,
        data: { runId: legacy.manifest.runId },
      }),
    ).toEqual(legacy);
    expect(await listRuns(database.client("user-a"), "user-a")).toEqual([legacy]);
  });

  it("fails closed for missing runs without exposing whether another owner has them", async () => {
    expect(await call(listResearchRuns)({ context: userA })).toEqual([]);
    expect(await call(readResearchRun)({ context: userA, data: { runId: "unknown" } })).toBeNull();
    expect(
      await call(compareResearchRuns)({
        context: userA,
        data: { runIdA: "unknown", runIdB: "unknown" },
      }),
    ).toBeNull();
    expect(await call(exportResearchRunCsv)({ context: userA, data: { runId: "unknown" } })).toBe(
      "",
    );
  });

  it("requires admin role before requesting cross-user diagnostics", async () => {
    await create(userA);
    const callsBefore = [...database.calls];
    await expect(call(getResearchLabDiagnostics)({ context: userA })).rejects.toThrow("forbidden");
    expect(database.calls.slice(callsBefore.length)).toEqual(["rpc:has_role:user-a"]);

    await create(userB);
    const result = await call(getResearchLabDiagnostics)({ context: adminContext });
    expect(result).toMatchObject({
      runCount: 2,
      persistenceAvailable: true,
      datasetHash: "",
      symbol: "",
      warnings: [],
    });
    const serialized = JSON.stringify(result);
    for (const value of ["user-a", "user-b", "nifty-close-fixture", "RESEARCH_RUN_"]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("rejects failed or indeterminate admin checks and database errors explicitly", async () => {
    database.injectedErrors.set("rpc.has_role", "08006");
    await expect(call(getResearchLabDiagnostics)({ context: adminContext })).rejects.toThrow(
      "Research Lab admin authorization check failed",
    );
    database.injectedErrors.set("rpc.research_lab_admin_snapshot", "08006");
    await expect(call(getResearchLabDiagnostics)({ context: adminContext })).rejects.toThrow(
      "Research Lab admin diagnostics read failed (08006)",
    );
    database.injectedErrors.set("research_lab_runs.select", "08006");
    await expect(call(listResearchRuns)({ context: userA })).rejects.toThrow(
      "Research Lab run listing failed (08006)",
    );
  });

  it("records failures durably and rethrows the original analytics error", async () => {
    const failure = new Error("offline dataset failure");
    vi.spyOn(dataset, "buildDataset").mockImplementation(() => {
      throw failure;
    });
    await expect(create(userA)).rejects.toBe(failure);
    expect(database.runs).toHaveLength(0);
    expect(database.failures).toHaveLength(1);
    expect(database.failures[0]).toMatchObject({ owner_id: "user-a" });
    expect(Number.isFinite(Date.parse(database.failures[0]!.created_at))).toBe(true);
    const diagnostics = await call(getResearchLabDiagnostics)({ context: adminContext });
    expect(diagnostics).toMatchObject({
      failedRuns: 1,
      lastFailureAt: database.failures[0]!.created_at,
    });
  });

  it("does not allow failure metrics to be recorded for another owner", async () => {
    await expect(recordFailure(database.client("user-a"), "user-b")).rejects.toThrow(
      "Research Lab failure recording failed (42501)",
    );
    expect(database.failures).toEqual([]);
  });

  it("reports both the original failure and failure-recording error", async () => {
    const build = vi.spyOn(await import("./dataset"), "buildDataset").mockImplementation(() => {
      throw new Error("analytics failure");
    });
    database.injectedErrors.set("rpc.record_research_lab_failure", "08006");
    await expect(create(userA)).rejects.toMatchObject({
      name: "AggregateError",
      message: "Research Lab run failed and failure tracking could not be persisted",
    });
    expect(build).toHaveBeenCalledOnce();
  });

  it("does not fall back to process memory when the database allocator or write fails", async () => {
    database.injectedErrors.set("rpc.allocate_research_lab_run_id", "08006");
    await expect(create(userA)).rejects.toThrow("Research Lab Run ID allocation failed (08006)");
    expect(database.runs).toHaveLength(0);
    expect(database.failures).toHaveLength(1);
    database.injectedErrors.set("research_lab_runs.insert", "08006");
    await expect(create(userA, "write-failure")).rejects.toThrow(
      "Research Lab run persistence failed (08006)",
    );
    expect(database.runs).toHaveLength(0);
    expect(database.failures).toHaveLength(2);
  });

  it("allocates globally increasing IDs across concurrent clients and a module restart", async () => {
    const contexts = Array.from({ length: 12 }, (_, index) =>
      ownerContext(database, `worker-${index % 3}`),
    );
    const reports = await Promise.all(
      contexts.map((context, index) => create(context, `concurrent-${index}`)),
    );
    const ids = reports.map((report) => report.manifest.runId);
    expect(new Set(ids).size).toBe(ids.length);
    const values = ids.map((runId) => decodeBase36(runId.slice("RESEARCH_RUN_".length)));
    expect([...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(
      Array.from({ length: 12 }, (_, index) => 8640000000000001n + BigInt(index)),
    );

    vi.resetModules();
    const restarted = await import("./research-lab.functions");
    const afterRestart = (await call(restarted.createResearchRun)({
      context: ownerContext(database, "worker-restarted"),
      data: { ...researchInput, datasetId: "after-restart" },
    })) as ResearchRunReport;
    expect(decodeBase36(afterRestart.manifest.runId.slice("RESEARCH_RUN_".length))).toBe(
      8640000000000013n,
    );
    expect(database.runs).toHaveLength(13);
  });

  it("keeps the pure report helper deterministic and timestamp-compatible", () => {
    const report = runResearchNow(researchInput, now);
    expect(report.manifest.runId).toBe(`RESEARCH_RUN_${nowMs.toString(36)}`);
    expect(runResearchNow(researchInput, now)).toEqual(report);
  });
});
