import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";

import { useHydrated } from "@/hooks/use-hydrated";
import { getDecisionSnapshot, type DecisionSnapshot } from "@/lib/decision.functions";
import { FormulaBadge } from "@/components/FormulaBadge";
import {
  humanAction,
  humanRegime,
  type Bias,
  type Contribution,
  type Decision,
  type DecisionAction,
  type Grade,
  type RiskLevel,
} from "@/lib/decision-engine";

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

const REFRESH_MS = 30_000;

const decisionQuery = () =>
  queryOptions({
    queryKey: ["decision-snapshot"],
    queryFn: () => getDecisionSnapshot(),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

export const Route = createFileRoute("/decision")({
  component: DecisionPage,
  head: () => ({
    meta: [
      { title: "Decision Intelligence Engine | EagleBABA" },
      {
        name: "description",
        content:
          "Transparent institutional recommendation engine that aggregates EagleBABA Astro, Options, PCR, Breadth, Sector, VIX and historical evidence into a single explainable trade decision.",
      },
      { property: "og:title", content: "Decision Intelligence Engine | EagleBABA" },
      {
        property: "og:description",
        content:
          "Aggregates every validated EagleBABA engine into one explainable BUY / WAIT / SELL recommendation with full evidence, conflicts, and risk.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(decisionQuery());
  },
});

function DecisionPage() {
  const { data } = useSuspenseQuery(decisionQuery());
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, padding: "1rem" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <Header snap={data} />
        <SummaryCards snap={data} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
            gap: "1rem",
          }}
        >
          <DecisionMatrix decision={data.decision} />
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <ConfidenceGauge decision={data.decision} />
            <RiskMeter decision={data.decision} />
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          <Checklist decision={data.decision} />
          <EvidencePanel decision={data.decision} />
        </div>
        <Explanation decision={data.decision} />
        <Footer snap={data} />
      </div>
    </div>
  );
}

/* --------------------------- Components --------------------------- */

function Header({ snap }: { snap: DecisionSnapshot }) {
  const hydrated = useHydrated();
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "0.75rem",
        marginBottom: "1rem",
      }}
    >
      <div>
        <div style={{ fontSize: "1.5rem", fontWeight: 800 }}>
          Decision Intelligence Engine
        </div>
        <div style={{ fontSize: "0.85rem", color: C.muted }}>
          {snap.context.symbol} · {snap.context.marketOpen ? "Market Open" : "Market Closed"} ·
          {" "}Provider {snap.context.provider} · Options {snap.context.optionsSource} ·
          {" "}Generated {hydrated ? new Date(snap.generatedAt).toLocaleTimeString() : "—"}
        </div>
        <div style={{ marginTop: 6 }}>
          <FormulaBadge version={snap.methodology?.astroFormulaVersion} compact />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Link
          to="/"
          style={{
            padding: "0.4rem 0.75rem",
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            color: C.text,
            textDecoration: "none",
            fontSize: "0.85rem",
          }}
        >
          ← Dashboard
        </Link>
      </div>
    </header>
  );
}

function actionColor(a: DecisionAction): string {
  if (a === "STRONG_BUY_CE" || a === "BUY_CE") return C.green;
  if (a === "STRONG_BUY_PE" || a === "BUY_PE") return C.red;
  return C.muted;
}

function biasColor(b: Bias): string {
  if (b === "BULL") return C.green;
  if (b === "BEAR") return C.red;
  return C.muted;
}

function riskColor(r: RiskLevel): string {
  if (r === "LOW") return C.green;
  if (r === "MEDIUM") return C.gold;
  return C.red;
}

function gradeColor(g: Grade): string {
  if (g === "A+" || g === "A") return C.green;
  if (g === "B") return C.gold;
  if (g === "C") return C.blue;
  return C.red;
}

function SummaryCards({ snap }: { snap: DecisionSnapshot }) {
  const d = snap.decision;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "0.75rem",
        marginBottom: "1rem",
      }}
    >
      <Card label="Decision">
        <div style={{ fontSize: "1.4rem", fontWeight: 900, color: actionColor(d.action) }}>
          {humanAction(d.action)}
        </div>
        <div style={{ fontSize: "0.75rem", color: C.muted }}>Net score {(d.netScore * 100).toFixed(0)}</div>
      </Card>
      <Card label="Confidence">
        <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>{d.confidence.toFixed(0)}%</div>
        <div style={{ fontSize: "0.75rem", color: C.muted }}>Grade {" "}
          <span style={{ color: gradeColor(d.grade), fontWeight: 700 }}>{d.grade}</span>
        </div>
      </Card>
      <Card label="Regime">
        <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{humanRegime(d.regime)}</div>
        <div style={{ fontSize: "0.75rem", color: C.muted }}>
          VIX {d.vix != null ? d.vix.toFixed(2) : "—"}
        </div>
      </Card>
      <Card label="Risk">
        <div style={{ fontSize: "1.2rem", fontWeight: 800, color: riskColor(d.risk.level) }}>
          {d.risk.level.replace("_", " ")}
        </div>
        <div style={{ fontSize: "0.75rem", color: C.muted }}>{d.risk.reasons[0]}</div>
      </Card>
      <Card label="Modules">
        <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>
          {d.contributions.filter((c) => c.present).length}/{d.contributions.length}
        </div>
        <div style={{ fontSize: "0.75rem", color: C.muted }}>
          {d.conflicts.length} conflict{d.conflicts.length === 1 ? "" : "s"}
        </div>
      </Card>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.75rem 1rem",
      }}
    >
      <div style={{ fontSize: "0.7rem", letterSpacing: 0.6, color: C.muted, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}

function DecisionMatrix({
  decision,
  capabilities,
}: {
  decision: Decision;
  capabilities?: DecisionSnapshot["capabilities"];
}) {
  // Phase 31 · replace generic "MISSING" with the exact capability state
  // for options and pcr. Other absent modules keep the legacy label.
  const capFor = (key: string): { label: string; hint: string } | null => {
    if (!capabilities) return null;
    if (key === "options") return { label: capabilities.options.capability, hint: capabilities.options.reason };
    if (key === "pcr") return { label: capabilities.pcr.capability, hint: capabilities.pcr.reason };
    return null;
  };
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem",
      }}
    >
      <SectionTitle>Decision Matrix</SectionTitle>
      <table style={{ width: "100%", fontSize: "0.85rem", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={th}>Module</th>
            <th style={th}>Bias</th>
            <th style={{ ...th, textAlign: "right" }}>Score</th>
            <th style={{ ...th, textAlign: "right" }}>Weight</th>
            <th style={{ ...th, textAlign: "right" }}>Contribution</th>
            <th style={th}>Note</th>
          </tr>
        </thead>
        <tbody>
          {decision.contributions.map((c) => {
            const cap = c.present ? null : capFor(c.key);
            return (
            <tr key={c.key} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={td}><strong>{c.label}</strong></td>
              <td style={{ ...td, color: c.present ? biasColor(c.bias) : C.muted, fontWeight: 700 }}>
                {c.present ? c.bias : cap?.label ?? "MISSING"}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                {c.present ? c.signedScore.toFixed(2) : "—"}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                {(c.effectiveWeight * 100).toFixed(0)}%
              </td>
              <td style={{ ...td, textAlign: "right", color: c.contribution >= 0 ? C.green : C.red }}>
                {c.contribution >= 0 ? "+" : ""}
                {(c.contribution * 100).toFixed(1)}
              </td>
              <td style={{ ...td, color: C.muted }}>
                {c.present ? c.note : cap?.hint ?? c.note}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {decision.conflicts.length > 0 && (
        <div style={{ marginTop: "0.6rem", fontSize: "0.8rem", color: C.red }}>
          Conflicts: {decision.conflicts.map((c) => c.reason).join(" · ")}
        </div>
      )}
    </section>
  );
}

function ConfidenceGauge({ decision }: { decision: Decision }) {
  const pct = Math.round(decision.confidence);
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem",
      }}
    >
      <SectionTitle>Confidence</SectionTitle>
      <div style={{ fontSize: "2rem", fontWeight: 900, color: actionColor(decision.action) }}>
        {pct}%
      </div>
      <div
        style={{
          height: 10,
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 999,
          overflow: "hidden",
          marginTop: 6,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: actionColor(decision.action),
            transition: "width 0.4s ease",
          }}
        />
      </div>
      {decision.penalties.length > 0 && (
        <ul style={{ marginTop: "0.75rem", padding: 0, listStyle: "none", fontSize: "0.78rem" }}>
          {decision.penalties.map((p, i) => (
            <li key={i} style={{ color: p.delta < 0 ? C.red : C.green }}>
              {p.delta > 0 ? "+" : ""}
              {p.delta}% · {p.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RiskMeter({ decision }: { decision: Decision }) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem",
      }}
    >
      <SectionTitle>Risk</SectionTitle>
      <div style={{ fontSize: "1.4rem", fontWeight: 900, color: riskColor(decision.risk.level) }}>
        {decision.risk.level.replace("_", " ")}
      </div>
      <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1rem", fontSize: "0.8rem", color: C.muted }}>
        {decision.risk.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </section>
  );
}

function Checklist({ decision }: { decision: Decision }) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem",
      }}
    >
      <SectionTitle>Trade Checklist</SectionTitle>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem" }}>
        {decision.checklist.map((item) => (
          <li
            key={item.key}
            style={{
              display: "flex",
              gap: "0.5rem",
              alignItems: "center",
              padding: "0.35rem 0",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                background: item.pass ? C.green : C.red,
                color: "#000",
                fontWeight: 900,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
              }}
            >
              {item.pass ? "✓" : "×"}
            </span>
            <span style={{ fontWeight: 600 }}>{item.label}</span>
            <span style={{ color: C.muted, marginLeft: "auto", fontSize: "0.78rem" }}>
              {item.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EvidencePanel({ decision }: { decision: Decision }) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem",
      }}
    >
      <SectionTitle>Evidence Timeline</SectionTitle>
      <EvidenceGroup title="Positive" tone={C.green} items={decision.positives} />
      <EvidenceGroup title="Negative" tone={C.red} items={decision.negatives} />
      <EvidenceGroup title="Missing" tone={C.muted} items={decision.missing} />
    </section>
  );
}

function EvidenceGroup({ title, tone, items }: { title: string; tone: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ color: tone, fontWeight: 700, fontSize: "0.8rem" }}>{title}</div>
      <ul style={{ paddingLeft: "1rem", margin: "0.25rem 0", fontSize: "0.82rem" }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function Explanation({ decision }: { decision: Decision }) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "0.9rem 1rem",
        marginTop: "1rem",
      }}
    >
      <SectionTitle>AI Explanation</SectionTitle>
      <p style={{ margin: 0, lineHeight: 1.5, fontSize: "0.9rem" }}>{decision.explanation}</p>
    </section>
  );
}

function Footer({ snap }: { snap: DecisionSnapshot }) {
  return (
    <div style={{ marginTop: "1rem", fontSize: "0.7rem", color: C.muted, lineHeight: 1.6 }}>
      Reuses only existing EagleBABA engines — Astro, Support/Resistance, Signal, Options,
      Backtest and Replay outputs. This module recomputes nothing and never overrides the
      validated production formulas. Weights redistribute transparently when a module is
      unavailable. Not financial advice.
      {snap.context.optionsSource !== "LIVE" && (
        <>
          {" "}Options source status:{" "}
          <strong style={{ color: C.gold }}>{snap.context.optionsSource}</strong>.
        </>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.72rem",
        letterSpacing: 0.7,
        color: C.muted,
        textTransform: "uppercase",
        marginBottom: "0.5rem",
      }}
    >
      {children}
    </div>
  );
}

const th: React.CSSProperties = { padding: "0.4rem 0.35rem", fontWeight: 500, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "0.45rem 0.35rem", verticalAlign: "top" };