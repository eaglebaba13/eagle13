import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testUpstoxProvider } from "@/lib/provider-foundation/upstox/upstox-smoke.functions";
import {
  ALL_QUOTE_SYMBOLS,
  DEFAULT_REFRESH_INTERVAL_MS,
  ProviderManager,
  createFactoryAdapter,
  type ManagerDiagnostics,
  type ProviderStatus,
} from "@/lib/provider-foundation";
import {
  UPSTOX_ADAPTER_ID,
  UPSTOX_ADAPTER_VERSION,
  UPSTOX_INSTRUMENT_MASTER_VERSION,
  UPSTOX_SUPPORTED_SYMBOLS,
} from "@/lib/provider-foundation/upstox";

type UpstoxSmokeReport = Awaited<ReturnType<typeof testUpstoxProvider>>;

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

function buildDemoManager(nowIso: string): ProviderManager {
  const primary = createFactoryAdapter({
    id: "primary-mock",
    label: "Primary Mock",
    role: "PRIMARY",
    capability: { domain: "QUOTES", quotes: [...ALL_QUOTE_SYMBOLS] },
    quotes: {
      NIFTY50: { last: 25000, prevClose: 24900, ageSec: 5 },
      BANKNIFTY: { last: 55000, prevClose: 54800, ageSec: 5 },
      INDIA_VIX: { last: 12.5, prevClose: 12.9, ageSec: 5 },
      GOLD: { last: 71000, prevClose: 70900, ageSec: 10 },
      SILVER: { last: 91000, prevClose: 90900, ageSec: 10 },
      XAUUSD: { last: 2400, prevClose: 2395, currency: "USD", ageSec: 5 },
      BTC: { last: 68000, prevClose: 67500, currency: "USD", ageSec: 5 },
      CRUDEOIL: { last: 6800, prevClose: 6750, ageSec: 30 },
      NATURAL_GAS: { last: 260, prevClose: 258, ageSec: 30 },
      USDINR: { last: 83.5, prevClose: 83.4, ageSec: 20 },
    },
    latencyMs: 45,
  });
  const secondary = createFactoryAdapter({
    id: "secondary-mock",
    label: "Secondary Mock",
    role: "SECONDARY",
    capability: { domain: "QUOTES", quotes: [...ALL_QUOTE_SYMBOLS] },
    quotes: {
      NIFTY50: { last: 24990, prevClose: 24900, ageSec: 20 },
      BANKNIFTY: { last: 54990, prevClose: 54800, ageSec: 20 },
    },
    latencyMs: 120,
  });
  const mgr = new ProviderManager({
    startedAt: nowIso,
    primary: primary.id,
    secondary: secondary.id,
  });
  mgr.register(primary);
  mgr.register(secondary);
  mgr.wire({
    domain: "QUOTES",
    primaryId: primary.id,
    secondaryId: secondary.id,
    rateLimit: { capacity: 60, refillPerSec: 5 },
  });
  return mgr;
}

function AdminProvidersPage() {
  const startedAt = useMemo(() => new Date().toISOString(), []);
  const [diag, setDiag] = useState<ManagerDiagnostics | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const mgr = buildDemoManager(startedAt);
    async function refresh() {
      const now = new Date();
      for (const sym of ALL_QUOTE_SYMBOLS) {
        await mgr.getQuote(sym, { nowIso: now.toISOString(), nowMs: now.getTime() });
      }
      if (!cancelled) setDiag(mgr.diagnostics());
    }
    void refresh();
    const iv = setInterval(() => setTick((t) => t + 1), 5000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, tick]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white">Provider Diagnostics</h1>
        <p className="text-sm text-slate-400">
          Provider Foundation V1 · demo diagnostics using mock adapters. Real
          provider adapters land in Phase 26 Stage 2–4. This page has no impact
          on dashboards, backtests, or trading logic.
        </p>
        <div className="text-xs text-slate-500 font-mono">
          session: {diag?.sessionId ?? "…"}
        </div>
      </header>

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
                  <span
                    className={`inline-block rounded border px-2 py-0.5 ${STATUS_COLORS[h.status]}`}
                  >
                    {h.status}
                  </span>
                </td>
                <td className="py-1 text-right">{h.calls}</td>
                <td className="py-1 text-right">{h.errors}</td>
                <td className="py-1 text-right">
                  {(h.errorRate * 100).toFixed(1)}%
                </td>
                <td className="py-1 text-right">{h.avgLatencyMs.toFixed(1)}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Cache</h2>
        {diag ? (
          <div className="grid grid-cols-5 gap-3 text-xs font-mono text-slate-300">
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

      <section className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">
          Upstox Historical V3 (read-only)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono text-slate-300">
          <Stat label="Adapter" value={UPSTOX_ADAPTER_ID} />
          <Stat label="Version" value={UPSTOX_ADAPTER_VERSION} />
          <Stat label="Instrument master" value={UPSTOX_INSTRUMENT_MASTER_VERSION} />
          <Stat label="Symbols" value={UPSTOX_SUPPORTED_SYMBOLS.length} />
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Read-only historical + intraday candles. Token status, health,
          latency and cache metrics are surfaced server-side only. API keys,
          secrets and access tokens are never rendered here.
        </p>
        <div className="mt-2 text-[11px] text-slate-500">
          Supported: {UPSTOX_SUPPORTED_SYMBOLS.join(", ")}
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          Timeframes: 1m · 3m · 5m · 15m · 1h · 1d — dashboard/backtest wiring
          is intentionally deferred to Stage 3.
        </div>

        <UpstoxLiveSmokeTestPanel />
      </section>
    </div>
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
    try {
      const report = (await runFn()) as UpstoxSmokeReport;
      setState({ kind: "ok", report });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "failed" });
    }
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
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {state.message === "forbidden" ? "Admin role required." : state.message}
        </div>
      )}

      {state.kind === "ok" && <UpstoxSmokeReportView report={state.report} />}
    </div>
  );
}

function SmokeCheck({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-800 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "✓" : "✗"}</span>
        <span className="text-slate-200">{label}</span>
      </div>
      {note ? <span className="font-mono text-[11px] text-slate-500">{note}</span> : null}
    </div>
  );
}

function UpstoxSmokeReportView({ report }: { report: UpstoxSmokeReport }) {
  const anyOk = (rs: UpstoxSmokeReport["quoteResults"]) => rs.some((r) => r.ok);
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/80 p-3 space-y-2 text-slate-200">
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-slate-400">at {report.at}</div>
        <div
          className={`rounded border px-2 py-0.5 text-[11px] ${
            report.summary.overall === "PASS"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : report.summary.overall === "PARTIAL"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          {report.summary.overall}
        </div>
      </div>

      <div>
        <SmokeCheck label="Authentication" ok={report.authenticated} note={report.tokenStatus.tokenSource} />
        <SmokeCheck
          label="Instrument Master"
          ok={report.instrumentResolved.every((r) => r.resolved)}
          note={`${report.instrumentResolved.filter((r) => r.resolved).length}/${report.instrumentResolved.length} resolved`}
        />
        <SmokeCheck label="Quote API" ok={anyOk(report.quoteResults)} note={`${report.quoteResults.filter((r) => r.ok).length}/${report.quoteResults.length} ok`} />
        <SmokeCheck label="Historical API" ok={anyOk(report.historicalResults)} note={`${report.historicalResults.filter((r) => r.ok).length}/${report.historicalResults.length} ok`} />
        <SmokeCheck label="Intraday API" ok={anyOk(report.intradayResults)} note={`${report.intradayResults.filter((r) => r.ok).length}/${report.intradayResults.length} ok`} />
        <SmokeCheck
          label="Cache"
          ok={true}
          note={`hits=${report.cache.hits} misses=${report.cache.misses} writes=${report.cache.writes}`}
        />
        <SmokeCheck
          label="Health"
          ok={report.health.errors === 0}
          note={`calls=${report.health.totalCalls} errors=${report.health.errors} avg=${report.health.avgLatencyMs.toFixed(0)}ms`}
        />
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

function SymbolTable({
  title,
  rows,
}: {
  title: string;
  rows: UpstoxSmokeReport["quoteResults"];
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
