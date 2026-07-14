import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { runAstroAuditFn } from "@/lib/astro-audit.functions";
import type { AuditReport } from "@/lib/astro-audit";
import { downloadBlob } from "@/lib/download";

export const Route = createFileRoute("/dev/astro-audit")({
  component: AstroAuditPage,
  head: () => ({
    meta: [
      { title: "Astro Audit (Phase 21.0B) | EagleBABA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Read-only astronomical precision audit. Dev/admin only." },
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
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
};

function AstroAuditPage() {
  const enabled =
    import.meta.env.DEV ||
    (typeof window !== "undefined" &&
      window.localStorage?.getItem("eb-diagnostics") === "on");
  if (!enabled) return <NotAvailable />;
  return <AuditDashboard />;
}

function NotAvailable() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 1, color: C.gold }}>Astro Audit</h1>
        <p style={{ marginTop: 12, color: C.muted, fontSize: 13 }}>
          Internal astronomical audit tool. Dev-only. Enable in this browser via
          {" "}<code style={{ background: C.card, padding: "2px 6px", borderRadius: 4 }}>
            localStorage.setItem("eb-diagnostics","on")
          </code>.
        </p>
      </div>
    </div>
  );
}

function statusColor(s: string): string {
  if (s === "EXACT") return C.green;
  if (s === "ACCEPTABLE") return C.gold;
  if (s === "WARNING") return "#f59e0b";
  return C.red;
}

function AuditDashboard() {
  const run = useServerFn(runAstroAuditFn);
  const q = useQuery({
    queryKey: ["astro-audit"],
    queryFn: () => run(),
    staleTime: 60_000,
  });

  const exportJson = (r: AuditReport) => {
    downloadBlob(
      JSON.stringify(r, null, 2),
      `astro-audit_${r.fixture.fixtureVersion}.json`,
      "application/json",
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: "24px 20px", fontSize: 13 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: C.gold, letterSpacing: 1 }}>
          Astro Audit · Phase 21.0B
        </h1>
        <p style={{ margin: "6px 0 0", color: C.muted, maxWidth: 780 }}>
          Read-only astronomical precision audit. Compares EagleBaba's current
          engine against captured Swiss / Drik / MPanchang / Prokerala reference
          fixtures. Production astronomy is <strong>not</strong> modified by
          this page.
        </p>
        <div style={{ marginTop: 10, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 6, background: C.card, color: C.muted, fontSize: 12, maxWidth: 780 }}>
          <strong style={{ color: C.gold }}>PROVISIONAL METHODOLOGY DEFAULT</strong>
          {" "}— Mean Node · Geocentric Moon · Lahiri (Chitrapaksha). Preserves current
          output and matches Drik Panchang default. Not a proven original Gann
          convention. Evidence tiers: VERIFIED_FACT · DOCUMENTED_DEFAULT ·
          INFERENCE · HYPOTHESIS · BACKTEST_RESULT.
        </div>
      </header>

      {q.isLoading && <p style={{ color: C.muted }}>Running audit…</p>}
      {q.error && (
        <p style={{ color: C.red }}>Audit failed: {(q.error as Error).message}</p>
      )}

      {q.data && q.data.fixtures === 0 && (
        <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: 16, background: C.card }}>
          <strong style={{ color: C.gold }}>No reference fixtures loaded.</strong>
          <p style={{ color: C.muted, margin: "6px 0 0" }}>
            Add captured JSON fixtures to{" "}
            <code>src/lib/__fixtures__/astro-reference/</code>. See the README in
            that folder for capture rules. Schema example is at{" "}
            <code>example.json</code>.
          </p>
        </div>
      )}

      {q.data?.reports.map((r) => (
        <section
          key={r.fixture.fixtureVersion}
          style={{ marginBottom: 24, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: C.gold, fontWeight: 600 }}>
                {r.fixture.fixtureVersion} · <span style={{ fontFamily: "monospace", fontSize: 12 }}>{r.mode}</span>
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>
                {r.fixture.timestampIso} · {r.fixture.location.label} · {r.fixture.referenceEngine}
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>
                Ayanamsha {r.fixture.ayanamshaMode} · Node {r.fixture.nodeMode} · Moon {r.fixture.moonConvention}
              </div>
            </div>
            <button
              onClick={() => exportJson(r)}
              style={{ background: C.gold, color: C.bg, border: 0, padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}
            >
              Export JSON
            </button>
          </header>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, margin: "12px 0" }}>
            <Stat label="Exact" value={r.summary.exact} color={C.green} />
            <Stat label="Acceptable" value={r.summary.acceptable} color={C.gold} />
            <Stat label="Warning" value={r.summary.warning} color="#f59e0b" />
            <Stat label="Fail" value={r.summary.fail} color={C.red} />
            <Stat label="Nak Miss" value={r.summary.nakshatraMismatches} />
            <Stat label="Pada Miss" value={r.summary.padaMismatches} />
            <Stat label="Retro Miss" value={r.summary.retroMismatches} />
            <Stat label="Max Δ Level" value={r.summary.maxLevelDelta} />
          </div>

          <div style={{ padding: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 12 }}>
            <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>Ayanamsha</div>
            <div>
              Current <strong>{r.ayanamsha.current.toFixed(6)}°</strong> · Reference{" "}
              <strong>{r.ayanamsha.reference.toFixed(6)}°</strong> · Δ{" "}
              <span style={{ color: statusColor(r.ayanamsha.toleranceStatus) }}>
                {r.ayanamsha.diffDeg.toFixed(6)}° ({r.ayanamsha.diffArcsec.toFixed(1)}″) · {r.ayanamsha.toleranceStatus}
              </span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: C.muted, textAlign: "left" }}>
                  <th style={th}>Planet</th>
                  <th style={th}>Current</th>
                  <th style={th}>Reference</th>
                  <th style={th}>Δ°</th>
                  <th style={th}>Δ″</th>
                  <th style={th}>Status</th>
                  <th style={th}>Sign</th>
                  <th style={th}>Nak</th>
                  <th style={th}>Pada</th>
                  <th style={th}>Retro</th>
                  <th style={th}>Max Δ Lvl</th>
                </tr>
              </thead>
              <tbody>
                {r.planets.map((p) => {
                  const li = r.levelImpacts.find((l) => l.planet === p.planet);
                  return (
                    <tr key={p.planet} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={td}>{p.planet}</td>
                      <td style={td}>{p.current.siderealLongitude.toFixed(4)}°</td>
                      <td style={td}>{p.reference.siderealLongitude.toFixed(4)}°</td>
                      <td style={td}>{p.diffDeg.toFixed(4)}</td>
                      <td style={td}>{p.diffArcsec.toFixed(1)}</td>
                      <td style={{ ...td, color: statusColor(p.toleranceStatus), fontWeight: 600 }}>
                        {p.toleranceStatus}
                      </td>
                      <td style={td}>{p.signMatch ? "✓" : "✗"}</td>
                      <td style={td}>{p.nakshatraMatch ? "✓" : "✗"}</td>
                      <td style={td}>{p.padaMatch ? "✓" : "✗"}</td>
                      <td style={td}>{p.retroMatch ? "✓" : "✗"}</td>
                      <td style={td}>{li?.maxLevelDelta ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 12, padding: 12, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6 }}>
            <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>
              Verdict <span style={{ color: C.muted, fontWeight: 400 }}>· evidence: {r.verdictEvidence}</span>
            </div>
            <div style={{ fontFamily: "monospace" }}>{r.verdict}</div>
            <div style={{ color: C.muted, marginTop: 4 }}>{r.verdictReason}</div>
          </div>
        </section>
      ))}
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "6px 8px", fontFamily: "monospace" };

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? C.text }}>{value}</div>
    </div>
  );
}