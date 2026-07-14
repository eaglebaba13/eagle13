import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getServerDiagnostics,
  type ServerDiagnostics,
} from "@/lib/diagnostics.functions";
import { getSchedulerMetrics, type SchedulerTaskSnapshot } from "@/lib/scheduler";
import { getErrorLog, recordError } from "@/lib/diagnostics";
import { downloadBlob } from "@/lib/download";
import { useTick } from "@/hooks/use-scheduler";

export const Route = createFileRoute("/dev/diagnostics")({
  component: DiagnosticsPage,
  head: () => ({
    meta: [
      { title: "Developer Diagnostics | EagleBABA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Internal developer diagnostics — not available in production." },
    ],
  }),
});

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
  gold: "var(--eb-accent)",
  blue: "var(--eb-blue)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
};

function DiagnosticsPage() {
  // Dev-only guard: in production this page renders a lightweight notice
  // instead of leaking internal metrics. The route file itself is not linked
  // from any navigation and is excluded from sitemaps via robots:noindex.
  const enabled =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("eb-diagnostics") === "on");

  if (!enabled) return <NotAvailable />;
  return <DiagnosticsDashboard />;
}

function NotAvailable() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 1, color: C.gold }}>Diagnostics</h1>
        <p style={{ marginTop: 12, color: C.muted, fontSize: 13 }}>
          Developer diagnostics are only available in development mode.
          To enable temporarily in this browser, run{" "}
          <code style={{ background: C.card, padding: "2px 6px", borderRadius: 4 }}>
            localStorage.setItem("eb-diagnostics","on")
          </code>{" "}
          and reload.
        </p>
      </div>
    </div>
  );
}

function DiagnosticsDashboard() {
  const fetchDiag = useServerFn(getServerDiagnostics);
  const q = useQuery({
    queryKey: ["dev-diagnostics"],
    queryFn: () => fetchDiag(),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  // Client-side snapshots that don't need server round trip.
  useTick(1000);
  const sched = getSchedulerMetrics();
  const clientErrors = getErrorLog();
  const perf = useClientPerf();

  const server: ServerDiagnostics | undefined = q.data;

  const health = useMemo(() => computeHealth(server, sched, perf), [server, sched, perf]);

  const exportJson = () => {
    const payload = {
      ts: Date.now(),
      health,
      server,
      scheduler: sched,
      clientErrors,
      perf,
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      `eaglebaba-diagnostics-${Date.now()}.json`,
      "application/json",
    );
  };
  const exportCsv = () => {
    const rows: string[] = [];
    rows.push("section,key,value");
    rows.push(`health,status,${health.status}`);
    if (server) {
      rows.push(`cache,hit_rate,${server.cache.totals.hitRate}`);
      rows.push(`cache,entries,${server.cache.totals.entries}`);
      rows.push(`api,total,${server.api.totals.total}`);
      rows.push(`api,ok,${server.api.totals.ok}`);
      rows.push(`api,failed,${server.api.totals.failed}`);
      rows.push(`api,avg_ms,${server.api.totals.avgMs}`);
    }
    rows.push(`scheduler,running,${sched.running}`);
    rows.push(`scheduler,tasks,${sched.taskCount}`);
    rows.push(`perf,fps,${perf.fps}`);
    rows.push(`perf,heap_mb,${perf.heapMb ?? ""}`);
    downloadBlob(
      rows.join("\n"),
      `eaglebaba-diagnostics-${Date.now()}.csv`,
      "text/csv",
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "24px 20px 60px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>Developer</div>
            <h1 style={{ margin: "4px 0 0", fontSize: 22, color: C.gold, letterSpacing: 1 }}>System Diagnostics</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <HealthBadge status={health.status} label={health.label} />
            <button onClick={() => q.refetch()} style={btn()}>Refresh</button>
            <button onClick={exportJson} style={btn()}>Export JSON</button>
            <button onClick={exportCsv} style={btn()}>Export CSV</button>
          </div>
        </header>

        <Grid cols={4}>
          <StatCard label="Cache Hit Rate" value={fmtPct(server?.cache.totals.hitRate)} sub={`${server?.cache.totals.hits ?? 0} hits · ${server?.cache.totals.misses ?? 0} misses`} tone="gold" />
          <StatCard label="API Requests" value={String(server?.api.totals.total ?? 0)} sub={`${server?.api.totals.failed ?? 0} failed · ${server?.api.totals.avgMs ?? 0}ms avg`} tone={server && server.api.totals.errorRate > 10 ? "red" : "green"} />
          <StatCard label="Scheduler" value={sched.running ? "RUNNING" : "IDLE"} sub={`${sched.taskCount} tasks · ${sched.tickMs}ms tick`} tone={sched.running ? "green" : "muted"} />
          <StatCard label="Client FPS" value={String(perf.fps)} sub={perf.heapMb != null ? `${perf.heapMb} MB heap` : "heap n/a"} tone={perf.fps >= 50 ? "green" : perf.fps >= 30 ? "gold" : "red"} />
        </Grid>

        <Section title="Astro Formula Version" sub={server?.formulaVersion.label ?? ""}>
          {!server ? <Skeleton /> : (
            <Table headers={["Default", "Cache Namespace", "Corrected Cache Entries", "Legacy Cache Entries", "Unversioned"]}>
              <tr>
                <td style={td()}>{server.formulaVersion.default}</td>
                <td style={td()}>{server.formulaVersion.cacheNamespace}</td>
                <td style={td("right")}>{server.formulaVersion.correctedCacheEntries}</td>
                <td style={td("right", server.formulaVersion.legacyCacheEntries > 0 ? C.gold : undefined)}>{server.formulaVersion.legacyCacheEntries}</td>
                <td style={td("right", server.formulaVersion.unversionedCacheEntries > 0 ? C.red : undefined)}>{server.formulaVersion.unversionedCacheEntries}</td>
              </tr>
            </Table>
          )}
        </Section>

        <Section title="Cache Monitor" sub={server ? `${server.cache.totals.keys} keys · ${server.cache.totals.entries} live entries · ${server.cache.totals.inFlight} in-flight` : ""}>
          {!server ? <Skeleton /> : (
            <Table headers={["Key", "Hits", "Stale", "Miss", "Refresh", "Hit %", "Age", "TTL Left", "In-flight"]}>
              {server.cache.keys.map((k) => (
                <tr key={k.key}>
                  <td style={td()}>{k.key}</td>
                  <td style={td("right")}>{k.hits}</td>
                  <td style={td("right")}>{k.staleHits}</td>
                  <td style={td("right")}>{k.misses}</td>
                  <td style={td("right")}>{k.refreshes}</td>
                  <td style={td("right")}>{k.hitRate}%</td>
                  <td style={td("right")}>{fmtMs(k.ageMs)}</td>
                  <td style={td("right")}>{fmtMs(k.ttlRemainingMs)}</td>
                  <td style={td("center")}>{k.inFlight ? "•" : ""}</td>
                </tr>
              ))}
              {server.cache.keys.length === 0 && (
                <tr><td colSpan={9} style={{ ...td("center"), color: C.muted, padding: 16 }}>No cache activity yet</td></tr>
              )}
            </Table>
          )}
        </Section>

        <Section title="API Health" sub={server ? `${server.api.totals.total} requests · ${server.api.totals.errorRate}% error rate` : ""}>
          {!server ? <Skeleton /> : (
            <Table headers={["Host", "Total", "OK", "Failed", "Err %", "Avg ms", "Retries", "Last Status", "Last Success", "Last Failure"]}>
              {server.api.hosts.map((h) => (
                <tr key={h.host}>
                  <td style={td()}>{h.host}</td>
                  <td style={td("right")}>{h.total}</td>
                  <td style={td("right")}>{h.ok}</td>
                  <td style={td("right", h.failed > 0 ? C.red : undefined)}>{h.failed}</td>
                  <td style={td("right", h.errorRate > 10 ? C.red : undefined)}>{h.errorRate}%</td>
                  <td style={td("right")}>{h.avgMs}</td>
                  <td style={td("right")}>{h.retries}</td>
                  <td style={td("right")}>{h.lastStatus ?? "—"}</td>
                  <td style={td("right")}>{fmtAgo(h.lastSuccessTs)}</td>
                  <td style={td("right", h.lastFailureTs ? C.red : undefined)}>{fmtAgo(h.lastFailureTs)}</td>
                </tr>
              ))}
              {server.api.hosts.length === 0 && (
                <tr><td colSpan={10} style={{ ...td("center"), color: C.muted, padding: 16 }}>No requests recorded yet</td></tr>
              )}
            </Table>
          )}
        </Section>

        <Section title="Scheduler Monitor">
          <Table headers={["#", "Task", "Period", "Runs", "Errors", "Last Duration", "Avg", "Last Run", "Next Run"]}>
            {sched.tasks.map((t: SchedulerTaskSnapshot) => (
              <tr key={t.id}>
                <td style={td()}>{t.id}</td>
                <td style={td()}>{t.name}</td>
                <td style={td("right")}>{fmtMs(t.periodMs)}</td>
                <td style={td("right")}>{t.runs}</td>
                <td style={td("right", t.errors > 0 ? C.red : undefined)}>{t.errors}</td>
                <td style={td("right")}>{t.lastDurationMs}ms</td>
                <td style={td("right")}>{t.avgDurationMs}ms</td>
                <td style={td("right")}>{fmtAgo(t.lastRunAt)}</td>
                <td style={td("right")}>{fmtIn(t.nextRunAt)}</td>
              </tr>
            ))}
            {sched.tasks.length === 0 && (
              <tr><td colSpan={9} style={{ ...td("center"), color: C.muted, padding: 16 }}>No active scheduler tasks</td></tr>
            )}
          </Table>
        </Section>

        <Section title="Live Request Log" sub="latest 100">
          {!server ? <Skeleton /> : (
            <Table headers={["Time", "Host", "Status", "Duration", "Retries", "URL"]}>
              {server.api.log.slice(0, 40).map((r, i) => (
                <tr key={i}>
                  <td style={td()}>{new Date(r.ts).toLocaleTimeString()}</td>
                  <td style={td()}>{r.host}</td>
                  <td style={td("right", r.ok ? C.green : C.red)}>{r.status ?? "ERR"}</td>
                  <td style={td("right")}>{r.durationMs}ms</td>
                  <td style={td("right")}>{r.retries}</td>
                  <td style={{ ...td(), color: C.muted, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.url}</td>
                </tr>
              ))}
              {server.api.log.length === 0 && (
                <tr><td colSpan={6} style={{ ...td("center"), color: C.muted, padding: 16 }}>No requests yet</td></tr>
              )}
            </Table>
          )}
        </Section>

        <Section title="Error Monitor" sub={`${(server?.errors.length ?? 0) + clientErrors.length} recorded`}>
          <Table headers={["Time", "Severity", "Source", "Message"]}>
            {[...(server?.errors ?? []), ...clientErrors].slice(0, 40).map((e, i) => (
              <tr key={i}>
                <td style={td()}>{new Date(e.ts).toLocaleTimeString()}</td>
                <td style={td("right", e.severity === "error" ? C.red : e.severity === "warning" ? C.gold : C.muted)}>{e.severity}</td>
                <td style={td()}>{e.source ?? "—"}</td>
                <td style={td()}>{e.message}</td>
              </tr>
            ))}
            {(server?.errors.length ?? 0) + clientErrors.length === 0 && (
              <tr><td colSpan={4} style={{ ...td("center"), color: C.muted, padding: 16 }}>No errors recorded</td></tr>
            )}
          </Table>
        </Section>

        <footer style={{ marginTop: 24, color: C.muted, fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
          EagleBABA · Diagnostics · dev-only · updated {new Date().toLocaleTimeString()}
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------ health engine ------------------------------ */

type Health = { status: "healthy" | "warning" | "critical"; label: string; emoji: string };

function computeHealth(
  server: ServerDiagnostics | undefined,
  sched: ReturnType<typeof getSchedulerMetrics>,
  perf: ClientPerf,
): Health {
  const issues: string[] = [];
  if (server) {
    if (server.api.totals.errorRate > 25) issues.push("api");
    if (server.api.totals.total > 5 && server.cache.totals.hitRate < 20) issues.push("cache");
  }
  if (typeof window !== "undefined" && !sched.running && sched.taskCount > 0) issues.push("scheduler");
  if (perf.fps > 0 && perf.fps < 25) issues.push("fps");
  if (perf.heapMb != null && perf.heapMb > 400) issues.push("memory");

  if (issues.length === 0) return { status: "healthy", label: "All systems nominal", emoji: "🟢" };
  if (issues.length <= 1) return { status: "warning", label: `Degraded: ${issues.join(", ")}`, emoji: "🟡" };
  return { status: "critical", label: `Critical: ${issues.join(", ")}`, emoji: "🔴" };
}

/* ------------------------------ client perf ------------------------------ */

type ClientPerf = { fps: number; heapMb: number | null };

function useClientPerf(): ClientPerf {
  const [state, setState] = useState<ClientPerf>({ fps: 0, heapMb: null });
  const raf = useRef<number | null>(null);
  const last = useRef(performance.now());
  const frames = useRef(0);

  useEffect(() => {
    const tick = (now: number) => {
      frames.current += 1;
      if (now - last.current >= 1000) {
        const fps = Math.round((frames.current * 1000) / (now - last.current));
        frames.current = 0;
        last.current = now;
        const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
        const heapMb = mem ? Math.round(mem.usedJSHeapSize / (1024 * 1024)) : null;
        setState({ fps, heapMb });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current != null) cancelAnimationFrame(raf.current); };
  }, []);

  useEffect(() => {
    const handler = (ev: ErrorEvent) => {
      recordError({ severity: "error", message: ev.message, source: "window.onerror", stack: ev.error?.stack });
    };
    const rej = (ev: PromiseRejectionEvent) => {
      recordError({ severity: "error", message: String(ev.reason?.message ?? ev.reason), source: "unhandledrejection" });
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", rej);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", rej);
    };
  }, []);

  return state;
}

/* ------------------------------ UI primitives ------------------------------ */

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24, border: `1px solid ${C.border}`, borderRadius: 10, background: C.card, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: C.gold }}>{title}</h2>
        {sub && <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>}
      </div>
      <div style={{ padding: 12, overflowX: "auto" }}>{children}</div>
    </section>
  );
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: 12, marginTop: 8 }}>
      {children}
      {/* cols hint retained for readability */}
      <span style={{ display: "none" }} data-cols={cols} />
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "red" | "gold" | "muted" }) {
  const color = tone === "green" ? C.green : tone === "red" ? C.red : tone === "gold" ? C.gold : C.text;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, background: C.card }}>
      <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 600, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ marginTop: 4, fontSize: 11, color: C.muted }}>{sub}</div>}
    </div>
  );
}

function HealthBadge({ status, label }: { status: Health["status"]; label: string }) {
  const color = status === "healthy" ? C.green : status === "warning" ? C.gold : C.red;
  const emoji = status === "healthy" ? "🟢" : status === "warning" ? "🟡" : "🔴";
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", border: `1px solid ${color}`, borderRadius: 999, color, fontSize: 12, letterSpacing: 1 }}>
      <span>{emoji}</span>
      <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{status}</span>
      <span style={{ color: C.muted, fontWeight: 400 }}>· {label}</span>
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: C.muted, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Skeleton() {
  return <div style={{ padding: 16, color: C.muted, fontSize: 12 }}>loading…</div>;
}

function btn(): React.CSSProperties {
  return {
    background: "transparent",
    color: C.text,
    border: `1px solid ${C.border}`,
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 12,
    letterSpacing: 1,
    cursor: "pointer",
  };
}

function td(align: "left" | "right" | "center" = "left", color?: string): React.CSSProperties {
  return {
    padding: "8px 10px",
    borderBottom: `1px solid ${C.border}`,
    textAlign: align,
    color: color ?? C.text,
    whiteSpace: "nowrap",
  };
}

/* ------------------------------ formatters ------------------------------ */

function fmtPct(n: number | undefined): string {
  if (n == null) return "—";
  return `${n}%`;
}
function fmtMs(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 60000) return `${Math.round(n / 6000) / 10}m`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}s`;
  return `${n}ms`;
}
function fmtAgo(ts: number | null | undefined): string {
  if (ts == null) return "—";
  const ms = Date.now() - ts;
  if (ms < 0) return "just now";
  return `${fmtMs(ms)} ago`;
}
function fmtIn(ts: number): string {
  const ms = ts - Date.now();
  if (ms <= 0) return "now";
  return `in ${fmtMs(ms)}`;
}