export type SmokeOverall = "PASS" | "PARTIAL" | "FAIL" | "NOT_CONFIGURED";

export interface SmokeReportLike {
  readonly configured: boolean;
  readonly authenticated: boolean;
  readonly tokenStatus: {
    readonly tokenSource: string;
    readonly reason: string;
  };
  readonly instrumentResolved: readonly { readonly resolved: boolean }[];
  readonly quoteResults: readonly { readonly ok: boolean; readonly latencyMs: number }[];
  readonly historicalResults: readonly { readonly ok: boolean; readonly latencyMs: number }[];
  readonly intradayResults: readonly { readonly ok: boolean; readonly latencyMs: number }[];
  readonly summary: { readonly overall: SmokeOverall; readonly safeError?: string | null };
  readonly cache: { readonly hits: number; readonly misses: number; readonly writes: number };
  readonly health: { readonly totalCalls: number; readonly errors: number; readonly avgLatencyMs: number };
}

export interface SmokeDiagnosticRow {
  readonly label:
    | "Authentication"
    | "Instrument Master"
    | "Quote API"
    | "Historical API"
    | "Intraday API"
    | "Cache"
    | "Health";
  readonly status: SmokeOverall;
  readonly note: string;
}

export interface ProviderHeaderLike {
  readonly realProviderActive: boolean;
  readonly mockActive: boolean;
  readonly providerSelected: string | null;
}

export type SmokeDispatchState<T extends SmokeReportLike> =
  | { readonly kind: "ok"; readonly report: T }
  | { readonly kind: "error"; readonly status: "FAIL"; readonly message: string };

export function redactUiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "failed");
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/access_token=[^&\s"']+/gi, "access_token=[REDACTED]")
    .replace(/UPSTOX_(API_KEY|API_SECRET|ACCESS_TOKEN)=[^\s"']+/gi, "UPSTOX_$1=[REDACTED]")
    .slice(0, 240);
}

export async function dispatchSmokeTest<T extends SmokeReportLike>(
  invoke: () => Promise<T>,
): Promise<SmokeDispatchState<T>> {
  try {
    return { kind: "ok", report: await invoke() };
  } catch (error) {
    return { kind: "error", status: "FAIL", message: redactUiError(error) };
  }
}

function endpointStatus(report: SmokeReportLike, rows: readonly { readonly ok: boolean }[]): SmokeOverall {
  if (report.summary.overall === "NOT_CONFIGURED") return "NOT_CONFIGURED";
  if (rows.length === 0) return "FAIL";
  if (rows.every((row) => row.ok)) return "PASS";
  if (rows.some((row) => row.ok)) return "PARTIAL";
  return "FAIL";
}

function resolutionStatus(report: SmokeReportLike): SmokeOverall {
  const rows = report.instrumentResolved;
  if (rows.length === 0) return report.summary.overall === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "FAIL";
  if (rows.every((row) => row.resolved)) return "PASS";
  if (rows.some((row) => row.resolved)) return "PARTIAL";
  return "FAIL";
}

export function buildSmokeDiagnosticRows(report: SmokeReportLike): readonly SmokeDiagnosticRow[] {
  const resolved = report.instrumentResolved.filter((row) => row.resolved).length;
  const quoteOk = report.quoteResults.filter((row) => row.ok).length;
  const historicalOk = report.historicalResults.filter((row) => row.ok).length;
  const intradayOk = report.intradayResults.filter((row) => row.ok).length;
  const healthStatus: SmokeOverall =
    report.summary.overall === "NOT_CONFIGURED"
      ? "NOT_CONFIGURED"
      : report.health.errors === 0
        ? "PASS"
        : report.health.errors < report.health.totalCalls
          ? "PARTIAL"
          : "FAIL";

  return [
    {
      label: "Authentication",
      status: !report.configured ? "NOT_CONFIGURED" : report.authenticated ? "PASS" : "FAIL",
      note: report.tokenStatus.tokenSource,
    },
    {
      label: "Instrument Master",
      status: resolutionStatus(report),
      note: `${resolved}/${report.instrumentResolved.length} resolved`,
    },
    {
      label: "Quote API",
      status: endpointStatus(report, report.quoteResults),
      note: `${quoteOk}/${report.quoteResults.length} ok`,
    },
    {
      label: "Historical API",
      status: endpointStatus(report, report.historicalResults),
      note: `${historicalOk}/${report.historicalResults.length} ok`,
    },
    {
      label: "Intraday API",
      status: endpointStatus(report, report.intradayResults),
      note: `${intradayOk}/${report.intradayResults.length} ok`,
    },
    {
      label: "Cache",
      status: report.summary.overall === "NOT_CONFIGURED" ? "NOT_CONFIGURED" : "PASS",
      note: `hits=${report.cache.hits} misses=${report.cache.misses} writes=${report.cache.writes}`,
    },
    {
      label: "Health",
      status: healthStatus,
      note: `calls=${report.health.totalCalls} errors=${report.health.errors} avg=${report.health.avgLatencyMs.toFixed(0)}ms`,
    },
  ];
}

export function providerHeaderText(report: ProviderHeaderLike | null): string {
  if (!report) return "Provider Foundation V1 · loading registered provider diagnostics.";
  if (report.realProviderActive) {
    return "Provider Foundation V1 · real Upstox ProviderAdapter active in read-only market-data mode.";
  }
  if (report.mockActive) {
    return "Provider Foundation V1 · mock fallback active because live market-data credentials are unavailable or this is development mode.";
  }
  return "Provider Foundation V1 · no live provider is active; configure live market-data credentials to enable diagnostics.";
}
