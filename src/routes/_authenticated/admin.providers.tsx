import { createFileRoute } from "@tanstack/react-router";
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProviderDiagnostics } from "@/lib/provider-foundation/provider-diagnostics.functions";
import {
  buildSmokeDiagnosticRows,
  classifySmokeError,
  dispatchSmokeTest,
  providerHeaderText,
  type SmokeErrorSource,
  type SmokeOverall,
} from "@/lib/provider-foundation/provider-diagnostics-ui";
import { testUpstoxProvider } from "@/lib/provider-foundation/upstox/upstox-smoke.functions";
import {
  DEFAULT_REFRESH_INTERVAL_MS,
  type ManagerDiagnostics,
  type ProviderStatus,
} from "@/lib/provider-foundation";

type UpstoxSmokeReport = Awaited<ReturnType<typeof testUpstoxProvider>>;
type ProviderDiagnosticsReport = Awaited<ReturnType<typeof getProviderDiagnostics>>;

export const Route = createFileRoute("/_authenticated/admin/providers")({
  head: () => ({
    meta: [
      { title: "Provider Diagnostics — EagleBABA" },
      {
        name: "description",
        content:
          "Admin-only provider foundation diagnostics: health, latency, calls, errors, cache and refresh intervals.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminProvidersPage,
});

const STATUS_COLORS: Record<ProviderStatus, string> = {
  LIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  DELAYED: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  STALE: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  RATE_LIMITED: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  FAILED: "bg-red-500/15 text-red-300 border-red-500/30",
  OFFLINE: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const SMOKE_STATUS_COLORS: Record<SmokeOverall, string> = {
  PASS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  PARTIAL: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  FAIL: "border-red-500/40 bg-red-500/10 text-red-200",
  NOT_CONFIGURED: "border-slate-500/40 bg-slate-500/10 text-slate-200",
};

class DiagnosticsErrorBoundary extends Component<
  { readonly children: ReactNode },
  { readonly message: string | null }
> {
  state: { readonly message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown) {
    const raw = error instanceof Error ? error.message : String(error ?? "diagnostics failed");
    return { message: raw.slice(0, 180) };
  }

  componentDidCatch(_error: unknown, _info: ErrorInfo) {
    // Boundary is intentionally silent: the UI renders a redacted status card.
  }

  render() {
    if (this.state.message) {
      return <FailureCard title="Provider diagnostics" message={this.state.message} />;
    }
    return this.props.children;
  }
}

function AdminProvidersPage() {
  const loadDiagnostics = useServerFn(getProviderDiagnostics);
  const [report, setReport] = useState<ProviderDiagnosticsReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const next = (await loadDiagnostics()) as ProviderDiagnosticsReport;
        if (!cancelled) {
          setReport(next);
          setLoadError(null);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "diagnostics failed";
        if (!cancelled) setLoadError(message.slice(0, 180));
      }
    }
    void refresh();
    const iv = setInterval(() => setTick((t) => t + 1), 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [loadDiagnostics, tick]);

  const diag = report?.diagnostics ?? null;

  return (
    <DiagnosticsErrorBoundary>
      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Provider Diagnostics</h1>
          <p className="text-sm text-slate-400">{providerHeaderText(report)}</p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-500 font-mono">
            <span>session: {diag?.sessionId ?? "…"}</span>
            <span>provider: {report?.providerSelected ?? "…"}</span>
            {report?.fallbackReason ? <span>fallback: {report.fallbackReason}</span> : null}
          </div>
        </header>

        {loadError ? <FailureCard title="Provider diagnostics" message={loadError} /> : null}
        {report?.safeError ? <FailureCard title="Provider diagnostics" message={report.safeError} /> : null}

        <ProviderDiagnosticsTables diag={diag} />
        <UpstoxReadOnlySection report={report} />
      </div>
    </DiagnosticsErrorBoundary>
  );
}

function ProviderDiagnosticsTables({ diag }: { diag: ManagerDiagnostics | null }) {
  return (
    <>
      <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Wirings</h2>
        <table className="w-full text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="text-left py-1">Domain</th>
              <th className="text-left py-1">Primary</th>
              <th className="text-left py-1">Secondary</th>
              <th className="text-right py-1">Refresh (ms)</th>
            </tr>
          </thead>
          <tbody className="text-slate-300 font-mono">
            {(diag?.wirings ?? []).map((w) => (
              <tr key={w.domain} className="border-t border-slate-800">
                <td className="py-1">{w.domain}</td>
                <td className="py-1">{w.primary ?? "—"}</td>
                <td className="py-1">{w.secondary ?? "—"}</td>
                <td className="py-1 text-right">
                  {w.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS[w.domain]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Health</h2>
        <table className="w-full text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="text-left py-1">Provider</th>
              <th className="text-left py-1">Status</th>
              <th className="text-right py-1">Calls</th>
              <th className="text-right py-1">Errors</th>
              <th className="text-right py-1">Err%</th>
              <th className="text-right py-1">Avg latency</th>
            </tr>
          </thead>
          <tbody className="text-slate-300 font-mono">
            {(diag?.health ?? []).map((h) => (
              <tr key={h.providerId} className="border-t border-slate-800">
                <td className="py-1">{h.providerId}</td>
                <td className="py-1">
                  <span className={`inline-block rounded border px-2 py-0.5 ${STATUS_COLORS[h.status]}`}>
                    {h.status}
                  </span>
                </td>
                <td className="py-1 text-right">{h.calls}</td>
                <td className="py-1 text-right">{h.errors}</td>
                <td className="py-1 text-right">{(h.errorRate * 100).toFixed(1)}%</td>
                <td className="py-1 text-right">{h.avgLatencyMs.toFixed(1)}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Cache</h2>
        {diag ? (
          <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-300 md:grid-cols-5">
            <Stat label="Hits" value={diag.cache.hits} />
            <Stat label="Misses" value={diag.cache.misses} />
            <Stat label="Writes" value={diag.cache.writes} />
            <Stat label="Evictions" value={diag.cache.evictions} />
            <Stat label="Size" value={diag.cache.size} />
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Recent decisions</h2>
        <ul className="text-xs font-mono text-slate-300 space-y-1 max-h-64 overflow-auto">
          {(diag?.lastDecisions ?? []).slice(-20).reverse().map((d, i) => (
            <li key={i} className="border-t border-slate-800 py-1">
              [{d.at}] {d.domain} → {d.chosen ?? "—"} ({d.role}) · {d.reason}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function UpstoxReadOnlySection({ report }: { report: ProviderDiagnosticsReport | null }) {
  return (
    <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">Upstox ProviderAdapter (read-only)</h2>
      <div className="grid grid-cols-2 gap-3 text-xs font-mono text-slate-300 md:grid-cols-4">
        <Stat label="Adapter" value={report?.providerSelected ?? "…"} />
        <Stat label="Version" value={report?.adapterVersion ?? "—"} />
        <Stat label="Instrument master" value={report?.instrumentMaster.version ?? "…"} />
        <Stat label="Symbols" value={report?.supportedSymbols.length ?? "…"} />
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        Read-only quotes, historical and intraday candles. Token status, health, latency and cache metrics are surfaced server-side only.
      </p>
      <div className="mt-2 text-[11px] text-slate-500">
        Supported: {report?.supportedSymbols.join(", ") ?? "…"}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        Timeframes: {report?.supportedIntervals.join(" · ") ?? "…"}
      </div>

      <UpstoxLiveSmokeTestPanel />
    </section>
  );
}

function UpstoxLiveSmokeTestPanel() {
  const runFn = useServerFn(testUpstoxProvider);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "ok"; report: UpstoxSmokeReport }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function run() {
    setState({ kind: "running" });
    const next = await dispatchSmokeTest(() => runFn() as Promise<UpstoxSmokeReport>);
    if (next.kind === "ok") setState({ kind: "ok", report: next.report });
    else setState({ kind: "error", message: next.message });
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={state.kind === "running"}
          className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {state.kind === "running" ? "Running live provider test…" : "Run Live Provider Test"}
        </button>
        <span className="text-[11px] text-slate-500">
          Read-only. Uses server-side UPSTOX_ACCESS_TOKEN. No orders, no writes.
        </span>
      </div>

      {state.kind === "error" && (
        <StatusCard status="FAIL" title="Live Provider Test" note={state.message === "forbidden" ? "Admin role required." : state.message} />
      )}

      {state.kind === "ok" && <UpstoxSmokeReportView report={state.report} />}
    </div>
  );
}

function UpstoxSmokeReportView({ report }: { report: UpstoxSmokeReport }) {
  const rows = buildSmokeDiagnosticRows(report);
  const overall = report.summary.overall as SmokeOverall;
  const errorSource = (report.summary.errorSource ?? null) as SmokeErrorSource | null;
  const safeSummaryError = report.summary.safeError ?? null;
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-slate-200">
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-slate-400">at {report.at}</div>
        <div className={`rounded border px-2 py-0.5 text-[11px] ${SMOKE_STATUS_COLORS[overall]}`}>
          {overall}
        </div>
      </div>

      {errorSource ? (
        <div
          data-testid="smoke-error-source"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-200"
        >
          <span className="font-semibold">Error source:</span> {errorSource}
          {safeSummaryError ? <span className="ml-2 text-red-300/80">· {safeSummaryError}</span> : null}
        </div>
      ) : null}

      <div>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between border-t border-slate-800 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className={`rounded border px-2 py-0.5 text-[10px] ${SMOKE_STATUS_COLORS[row.status]}`}>
                {row.status}
              </span>
              <span className="text-slate-200">{row.label}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">{row.note}</span>
          </div>
        ))}
      </div>

      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer">Per-symbol detail</summary>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <SymbolTable title="Quote" rows={report.quoteResults} />
          <SymbolTable title="Historical" rows={report.historicalResults} />
          <SymbolTable title="Intraday" rows={report.intradayResults} />
        </div>
      </details>
    </div>
  );
}

function StatusCard({ status, title, note }: { status: SmokeOverall; title: string; note: string }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${SMOKE_STATUS_COLORS[status]}`}>
      <div className="font-semibold">{title}: {status}</div>
      <div className="mt-1 opacity-90">{note}</div>
    </div>
  );
}

function FailureCard({ title, message }: { title: string; message: string }) {
  return <StatusCard status="FAIL" title={title} note={message} />;
}

interface SmokeSymbolRow {
  readonly symbol: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly errorSource?: SmokeErrorSource | null;
  readonly safeError?: string | null;
}

function SymbolTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly SmokeSymbolRow[];
}) {
  return (
    <div className="rounded border border-slate-800 p-2">
      <div className="mb-1 text-xs font-semibold text-slate-200">{title}</div>
      <table className="w-full text-[11px] font-mono text-slate-400">
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-t border-slate-800">
              <td className="py-0.5">{r.symbol}</td>
              <td className={`py-0.5 ${r.ok ? "text-emerald-300" : "text-red-300"}`}>{r.ok ? "ok" : "fail"}</td>
              <td className={`py-0.5 ${r.ok ? "text-slate-500" : "text-red-300/80"}`}>
                {r.errorSource ?? ""}
              </td>
              <td className="py-0.5 text-right">{r.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-slate-100 text-base break-all">{value}</div>
    </div>
  );
}
