import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ALL_QUOTE_SYMBOLS,
  DEFAULT_REFRESH_INTERVAL_MS,
  ProviderManager,
  createFactoryAdapter,
  type ManagerDiagnostics,
  type ProviderStatus,
} from "@/lib/provider-foundation";

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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-slate-100 text-base">{value}</div>
    </div>
  );
}
