import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getGannIntradaySnapshot,
  type IntradaySnapshot,
} from "@/lib/gann-intraday.functions";
import type { InstrumentSymbol } from "@/lib/gann-intraday-anchor";
import { GANN_PART1_BEAR_STARS } from "@/lib/gann-part1-stars";
import { PROVISIONAL_POLICIES } from "@/lib/gann-intraday-policy";
import {
  runIntradayValidation,
  type ValidationResult,
} from "@/lib/gann-intraday-validation.functions";
import {
  toValidationCsv,
  toValidationJson,
  validationExportFilename,
} from "@/lib/gann-intraday-export";
import type { AmbiguousPolicy } from "@/lib/gann-intraday-simulator";
import {
  computeReplayView,
  initReplay,
  jumpReplay,
  restartReplay,
  stepReplay,
  type ReplayState,
} from "@/lib/gann-intraday-replay";
import { downloadBlob } from "@/lib/download";

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

const intradayQuery = (instrument: InstrumentSymbol) =>
  queryOptions({
    queryKey: ["gann-intraday-absolute", instrument],
    queryFn: () => getGannIntradaySnapshot({ data: { instrument } }),
    refetchInterval: 60_000,
  });

export const Route = createFileRoute("/absolute-intraday")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(intradayQuery("NIFTY50")),
  component: AbsoluteIntradayPage,
  head: () => ({
    meta: [
      { title: "Absolute Degree Intraday · Preview | EagleBABA" },
      {
        name: "description",
        content:
          "Preview of the paid-course Absolute-Degree Intraday methodology (Gann Nifty Astro v1) — 09:15 IST daily snapshot for NIFTY 50 and BANK NIFTY. Not the production default.",
      },
      { property: "og:title", content: "Absolute Degree Intraday · Preview" },
      {
        property: "og:description",
        content: "09:15 IST daily Astro snapshot preview — Absolute-Degree Intraday v1.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: ({ error, reset }) => (
    <div style={{ padding: 32, color: C.red, fontFamily: "var(--eb-mono)" }}>
      Snapshot unavailable: {error.message}
      <button
        onClick={reset}
        style={{ marginLeft: 12, padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 6, background: "transparent", color: C.text, cursor: "pointer" }}
      >
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div style={{ padding: 32, color: C.muted }}>Not found.</div>
  ),
});

function StatusPill({ status }: { status: IntradaySnapshot["status"] }) {
  const color =
    status === "LOCKED"
      ? C.green
      : status === "HISTORICAL_LOCKED"
        ? C.blue
        : status === "PREVIEW"
          ? C.gold
          : C.muted;
  const label =
    status === "PREVIEW"
      ? "PREVIEW — FINAL 09:15 SNAPSHOT NOT LOCKED"
      : status === "LOCKED"
        ? "LOCKED"
        : status === "HISTORICAL_LOCKED"
          ? "HISTORICAL LOCKED"
          : "NO TRADING SESSION";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        border: `1px solid ${color}`,
        color,
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </span>
  );
}

function Card({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 12,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, fontFamily: "var(--eb-mono)" }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function AbsoluteIntradayPage() {
  const [instrument, setInstrument] = useState<InstrumentSymbol>("NIFTY50");
  const { data } = useSuspenseQuery(intradayQuery(instrument));
  const [tab, setTab] = useState<
    "SNAPSHOT" | "RANKED" | "EXECUTION" | "CUBE" | "REPLAY" | "METHODOLOGY"
  >("SNAPSHOT");
  const [ambiguousPolicy, setAmbiguousPolicy] =
    useState<AmbiguousPolicy>("conservative");

  const runValidation = useServerFn(runIntradayValidation);
  const validation = useQuery({
    queryKey: ["gann-intraday-validation", instrument, ambiguousPolicy],
    queryFn: () =>
      runValidation({
        data: { instrument, ambiguousPolicy, starBias: "UNKNOWN" },
      }),
    enabled:
      data.status === "LOCKED" ||
      data.status === "HISTORICAL_LOCKED",
    refetchInterval: data.status === "LOCKED" ? 60_000 : false,
  });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, padding: "18px 14px 60px" }}>
      <style>{`
        .abs-tbl { width:100%; border-collapse:collapse; font-size:12.5px; font-family:var(--eb-mono); }
        .abs-tbl th { text-align:left; padding:8px 10px; font-size:10.5px; color:${C.muted}; text-transform:uppercase; border-bottom:1px solid ${C.border}; position:sticky; top:0; background:${C.card}; }
        .abs-tbl td { padding:8px 10px; border-bottom:1px solid ${C.border}; white-space:nowrap; }
        .abs-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid ${C.border}; border-radius:10px; background:${C.card}; }
        .abs-grid { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); }
        .abs-tabs { display:flex; gap:8px; flex-wrap:wrap; }
        .abs-tab { border:1px solid ${C.border}; background:transparent; color:${C.muted}; padding:8px 16px; border-radius:10px; font-weight:700; cursor:pointer; font-size:13px; }
        .abs-tab.on { border-color:${C.gold}; color:#000; background:${C.gold}; }
        @media (max-width: 640px) {
          .abs-tbl { font-size:11.5px; }
          .abs-tbl th, .abs-tbl td { padding:6px 8px; }
        }
      `}</style>

      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{
            background: "rgba(255,190,0,0.12)",
            border: `1px solid ${C.gold}`,
            color: C.gold,
            padding: "8px 12px",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          VALIDATION MODE — no push alerts, no broker orders, no Decision Engine
          wiring. Preview only.
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
            Absolute Degree Intraday · Preview
          </h1>
          <StatusPill status={data.status} />
          <Link to="/live-levels" style={{ marginLeft: "auto", color: C.blue, fontSize: 12 }}>
            ← Sign-Degree Terminal
          </Link>
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Formula: <strong style={{ color: C.text }}>Absolute Degree Intraday v1</strong> ·
          {" "}Preview-only. Existing production default remains unchanged.
        </div>

        <div className="abs-tabs" style={{ marginBottom: 14 }}>
          {(["NIFTY50", "BANKNIFTY"] as InstrumentSymbol[]).map((k) => (
            <button
              key={k}
              className={`abs-tab${k === instrument ? " on" : ""}`}
              onClick={() => setInstrument(k)}
            >
              {k === "NIFTY50" ? "NIFTY 50" : "BANK NIFTY"}
            </button>
          ))}
        </div>

        <div className="abs-tabs" style={{ marginBottom: 14 }}>
          {(
            [
              ["SNAPSHOT", "Snapshot"],
              ["RANKED", "Ranked Levels"],
              ["EXECUTION", "Execution"],
              ["CUBE", "Cube Setup"],
              ["REPLAY", "Replay Validation"],
              ["METHODOLOGY", "Methodology"],
            ] as const
          ).map(([id, lbl]) => (
            <button
              key={id}
              className={`abs-tab${tab === id ? " on" : ""}`}
              onClick={() => setTab(id)}
            >
              {lbl}
            </button>
          ))}
        </div>

        {data.status === "NO_TRADING_SESSION" ? (
          <div style={{ padding: 24, background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, color: C.muted }}>
            {data.tradingDate} is a non-trading day (weekend). No snapshot generated.
          </div>
        ) : tab === "METHODOLOGY" ? (
          <Methodology />
        ) : tab === "SNAPSHOT" ? (
          <SnapshotTab data={data} />
        ) : tab === "RANKED" ? (
          <RankedTab data={data} />
        ) : tab === "EXECUTION" ? (
          <ExecutionTab
            validation={validation.data}
            loading={validation.isLoading}
            error={validation.error}
            ambiguousPolicy={ambiguousPolicy}
            setAmbiguousPolicy={setAmbiguousPolicy}
          />
        ) : tab === "CUBE" ? (
          <CubeTab validation={validation.data} loading={validation.isLoading} />
        ) : (
          <ReplayTab validation={validation.data} loading={validation.isLoading} />
        )}
      </div>
    </div>
  );
}

function SnapshotTab({ data }: { data: IntradaySnapshot }) {
  return (
          <>
            <div className="abs-grid" style={{ marginBottom: 14 }}>
              <Card title="Trading Date" value={data.tradingDate} sub={`Anchor ${data.anchorIst}`} />
              <Card title="Previous Close" value={data.previousClose.toLocaleString()} sub={`As of ${data.previousCloseDate}`} />
              <Card title="Upper 360 Multiple" value={data.upperMultiple.toLocaleString()} />
              <Card title="Lower 360 Multiple" value={data.lowerMultiple.toLocaleString()} />
              <Card title="Raw Levels" value={data.rawLevels.length} sub={`${data.clusters.length} clusters`} />
              <Card
                title="Nearest Safe Buy"
                value={data.nearestSafeBuy?.value.toLocaleString() ?? "—"}
                sub={data.nearestSafeBuy ? `${data.nearestSafeBuy.planet} ${data.nearestSafeBuy.sourceLevel}` : ""}
              />
              <Card
                title="Nearest Safe Sell"
                value={data.nearestSafeSell?.value.toLocaleString() ?? "—"}
                sub={data.nearestSafeSell ? `${data.nearestSafeSell.planet} ${data.nearestSafeSell.sourceLevel}` : ""}
              />
              <Card
                title="Next Safe Buy"
                value={data.nextSafeBuy?.value.toLocaleString() ?? "—"}
                sub={data.nextSafeBuy ? `${data.nextSafeBuy.planet} ${data.nextSafeBuy.sourceLevel}` : ""}
              />
              <Card
                title="Next Safe Sell"
                value={data.nextSafeSell?.value.toLocaleString() ?? "—"}
                sub={data.nextSafeSell ? `${data.nextSafeSell.planet} ${data.nextSafeSell.sourceLevel}` : ""}
              />
            </div>

            <h2 style={{ fontSize: 14, margin: "18px 0 8px", color: C.gold }}>
              Planet Snapshot · 09:15 IST
            </h2>
            <div className="abs-scroll">
              <table className="abs-tbl">
                <thead>
                  <tr>
                    <th>Planet</th>
                    <th>Absolute °</th>
                    <th>Sign</th>
                    <th>Sign °</th>
                    <th>Nakshatra</th>
                    <th>Pada</th>
                    <th>Motion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.planets.map((p) => (
                    <tr key={p.planet}>
                      <td>{p.planet}</td>
                      <td>{p.siderealAbsoluteLongitude.toFixed(2)}</td>
                      <td>{p.sign}</td>
                      <td>{p.degreeWithinSign.toFixed(2)}</td>
                      <td>{p.nakshatra}</td>
                      <td>{p.pada}</td>
                      <td style={{ color: p.retrograde ? C.red : C.muted }}>{p.motion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 style={{ fontSize: 14, margin: "18px 0 8px", color: C.gold }}>
              Part-One Source Evidence
            </h2>
            <div style={{ fontSize: 12, color: C.muted, background: C.card, padding: 12, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              {GANN_PART1_BEAR_STARS.map((s) => (
                <div key={s.nakshatra}>
                  <strong style={{ color: C.text }}>{s.nakshatra}</strong> · {s.classification} ·
                  {" "}source: {s.evidenceSource} · observations: {s.historicalObservationCount},
                  {" "}monthly tops: {s.monthlyTops} · confidence: {s.confidence}
                </div>
              ))}
              <div style={{ marginTop: 6 }}>
                Displayed separately from the existing EagleBaba nakshatra classification.
              </div>
            </div>

            <div style={{ marginTop: 14, fontSize: 11, color: C.muted }}>
              Snapshot generated {new Date(data.generatedAt).toISOString()} · not connected to
              live BUY/SELL alerts, Decision Engine, or broker.
            </div>
          </>
  );
}

function RankedTab({ data }: { data: IntradaySnapshot }) {
  return (
    <>
      <h2 style={{ fontSize: 14, margin: "6px 0 8px", color: C.gold }}>
              Absolute Levels (L1–L4 · 36 rows)
            </h2>
            <div className="abs-scroll">
              <table className="abs-tbl">
                <thead>
                  <tr>
                    <th>Planet</th>
                    <th>Src</th>
                    <th>Level</th>
                    <th>Side</th>
                    <th>Distance</th>
                    <th>Safe</th>
                    <th>Cluster</th>
                    <th>Sun/Moon</th>
                    <th>Exact-360</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rankedLevels.map((l, i) => (
                    <tr key={`${l.planet}-${l.sourceLevel}-${i}`}>
                      <td>{l.planet}</td>
                      <td>{l.sourceLevel}</td>
                      <td>{l.value.toLocaleString()}</td>
                      <td style={{ color: l.side === "RESISTANCE" ? C.red : l.side === "SUPPORT" ? C.green : C.muted }}>
                        {l.side}
                      </td>
                      <td>{l.distanceFromClose.toFixed(0)}</td>
                      <td style={{ color: l.safety === "SAFE" ? C.green : C.gold }}>{l.safety}</td>
                      <td>{l.clusterCount}</td>
                      <td>{l.sunMoonPriority ? "★" : ""}</td>
                      <td>{l.exact360Confluence ? "✓" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
    </>
  );
}

function LoadingBox({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: 20, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      {children}
    </div>
  );
}

function ExecutionTab({
  validation,
  loading,
  error,
  ambiguousPolicy,
  setAmbiguousPolicy,
}: {
  validation: ValidationResult | undefined;
  loading: boolean;
  error: Error | null;
  ambiguousPolicy: AmbiguousPolicy;
  setAmbiguousPolicy: (p: AmbiguousPolicy) => void;
}) {
  if (loading) return <LoadingBox>Loading 5-minute session…</LoadingBox>;
  if (error)
    return <LoadingBox>Validation unavailable: {error.message}</LoadingBox>;
  if (!validation) return <LoadingBox>No validation session available yet.</LoadingBox>;

  const s = validation.simulation;
  const c = validation.candles;
  return (
    <>
      <div className="abs-grid" style={{ marginBottom: 14 }}>
        <Card title="5m Candles" value={c.candles.length} sub={`Provider ${c.provider}`} />
        <Card title="Missing" value={c.missingCount} sub={`Expected ${c.expectedCount}`} />
        <Card title="First Touches" value={s.counters.firstTouch} />
        <Card title="Confirmed" value={s.counters.confirmed} />
        <Card title="Retests" value={s.counters.retest} />
        <Card title="Missed Chase" value={s.counters.missedChase} />
        <Card title="Targets Hit" value={s.counters.targetHit} />
        <Card title="Stops Hit" value={s.counters.stopHit} />
        <Card title="Ambiguous" value={s.counters.ambiguous} sub={`Policy ${ambiguousPolicy}`} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(["conservative", "optimistic", "exclude_ambiguous"] as AmbiguousPolicy[]).map((p) => (
          <button
            key={p}
            className={`abs-tab${p === ambiguousPolicy ? " on" : ""}`}
            onClick={() => setAmbiguousPolicy(p)}
          >
            {p}
          </button>
        ))}
        <ExportButtons validation={validation} />
      </div>
      <div className="abs-scroll">
        <table className="abs-tbl">
          <thead>
            <tr>
              <th>Planet</th>
              <th>Src</th>
              <th>Level</th>
              <th>Side</th>
              <th>Safe</th>
              <th>State</th>
              <th>Touch</th>
              <th>Confirm</th>
              <th>Retest</th>
              <th>Entry</th>
              <th>SL</th>
              <th>Target</th>
              <th>Outcome</th>
              <th>MFE</th>
              <th>MAE</th>
              <th>Ambig</th>
            </tr>
          </thead>
          <tbody>
            {s.perLevel.map((p, i) => (
              <tr key={`${p.level.planet}-${p.level.sourceLevel}-${i}`}>
                <td>{p.level.planet}</td>
                <td>{p.level.sourceLevel}</td>
                <td>{p.level.value.toLocaleString()}</td>
                <td style={{ color: p.level.side === "RESISTANCE" ? C.red : p.level.side === "SUPPORT" ? C.green : C.muted }}>
                  {p.level.side}
                </td>
                <td style={{ color: p.level.safety === "SAFE" ? C.green : C.gold }}>{p.level.safety}</td>
                <td>{p.finalPlan.state}</td>
                <td>{p.touchIndex ?? ""}</td>
                <td>{p.confirmIndex ?? ""}</td>
                <td>{p.retestIndex ?? ""}</td>
                <td>{p.entry?.toLocaleString() ?? ""}</td>
                <td>{p.stopLoss?.toLocaleString() ?? ""}</td>
                <td>{p.target?.toLocaleString() ?? ""}</td>
                <td style={{ color: p.outcome === "TARGET" ? C.green : p.outcome === "STOP" ? C.red : C.muted }}>{p.outcome}</td>
                <td>{p.mfe}</td>
                <td>{p.mae}</td>
                <td>{p.ambiguousCandleCount || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CubeTab({
  validation,
  loading,
}: {
  validation: ValidationResult | undefined;
  loading: boolean;
}) {
  if (loading || !validation) return <LoadingBox>Loading Cube evaluations…</LoadingBox>;
  return (
    <div className="abs-scroll">
      <table className="abs-tbl">
        <thead>
          <tr>
            <th>Planet</th>
            <th>Src</th>
            <th>Level</th>
            <th>Bias</th>
            <th>Mandatory</th>
            <th>Aligned</th>
            <th>Conflict</th>
            <th>Grade</th>
            <th>Action</th>
            <th>Reasons</th>
          </tr>
        </thead>
        <tbody>
          {validation.simulation.perLevel.map((p, i) => (
            <tr key={`${p.level.planet}-${i}`}>
              <td>{p.level.planet}</td>
              <td>{p.level.sourceLevel}</td>
              <td>{p.level.value.toLocaleString()}</td>
              <td>{p.level.tradeBias}</td>
              <td style={{ color: p.cube.mandatoryPassed ? C.green : C.red }}>{p.cube.mandatoryPassed ? "PASS" : "FAIL"}</td>
              <td>{p.cube.conditionsAligned}/{p.cube.conditionsAvailable}</td>
              <td>{p.cube.conditionsConflicting}</td>
              <td>{p.cube.cubeGrade}</td>
              <td>{p.cube.action}</td>
              <td style={{ whiteSpace: "normal", color: C.muted }}>{p.cube.reasons.join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplayTab({
  validation,
  loading,
}: {
  validation: ValidationResult | undefined;
  loading: boolean;
}) {
  if (loading || !validation) return <LoadingBox>Loading replay…</LoadingBox>;
  return <ReplayTabInner validation={validation} />;
}

function ReplayTabInner({ validation }: { validation: ValidationResult }) {
  const [state, setState] = useState<ReplayState>(() =>
    initReplay({
      instrument: validation.snapshot.instrument,
      ranked: validation.snapshot.rankedLevels,
      candles: validation.candles.candles,
      cubeInputs: validation.cubeInputs,
      ambiguousPolicy: validation.ambiguousPolicy,
    }),
  );
  // Reset on validation identity change.
  useEffect(() => {
    setState(
      initReplay({
        instrument: validation.snapshot.instrument,
        ranked: validation.snapshot.rankedLevels,
        candles: validation.candles.candles,
        cubeInputs: validation.cubeInputs,
        ambiguousPolicy: validation.ambiguousPolicy,
      }),
    );
  }, [validation]);
  const derived = useMemo(() => computeReplayView(state), [state]);
  const total = state.candles.length;
  const cursor = state.cursor;
  const currentCandle = cursor > 0 ? state.candles[cursor - 1] : null;
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button className="abs-tab" onClick={() => setState(restartReplay(state))}>⏮ Restart</button>
        <button className="abs-tab" onClick={() => setState(stepReplay(state, -1))} disabled={cursor === 0}>◀ Step</button>
        <button className="abs-tab" onClick={() => setState(stepReplay(state, 1))} disabled={cursor === total}>Step ▶</button>
        <button className="abs-tab" onClick={() => setState(jumpReplay(state, total))}>End ⏭</button>
        <span style={{ color: C.muted, fontSize: 12 }}>
          Candle {cursor} / {total} {currentCandle ? `· ${currentCandle.timeIst}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={total}
        value={cursor}
        onChange={(e) => setState(jumpReplay(state, Number(e.target.value)))}
        style={{ width: "100%", marginBottom: 14 }}
      />
      <div className="abs-grid" style={{ marginBottom: 14 }}>
          <Card title="Touches so far" value={derived.counters.firstTouch} />
          <Card title="Confirmed" value={derived.counters.confirmed} />
          <Card title="Retests" value={derived.counters.retest} />
          <Card title="Targets" value={derived.counters.targetHit} />
          <Card title="Stops" value={derived.counters.stopHit} />
          <Card title="Missed Chase" value={derived.counters.missedChase} />
      </div>
    </>
  );
}

function ExportButtons({ validation }: { validation: ValidationResult }) {
  const args = {
    instrument: validation.snapshot.instrument,
    tradingDate: validation.snapshot.tradingDate,
    anchorIst: validation.snapshot.anchorIst,
    previousClose: validation.snapshot.previousClose,
    ambiguousPolicy: validation.ambiguousPolicy,
    simulation: validation.simulation,
  };
  return (
    <>
      <button
        className="abs-tab"
        onClick={() =>
          downloadBlob(
            toValidationCsv(args),
            validationExportFilename(args.instrument, args.tradingDate, "csv"),
            "text/csv",
          )
        }
      >
        Export CSV
      </button>
      <button
        className="abs-tab"
        onClick={() =>
          downloadBlob(
            toValidationJson(args),
            validationExportFilename(args.instrument, args.tradingDate, "json"),
            "application/json",
          )
        }
      >
        Export JSON
      </button>
    </>
  );
}

function Methodology() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 12.5, lineHeight: 1.55 }}>
      <div style={{ fontWeight: 700, color: C.gold, marginBottom: 6 }}>
        Methodology · Absolute Degree Intraday v1
      </div>
      <div style={{ color: C.muted }}>
        <strong>Inputs:</strong> previous completed trading-session close ·
        upcoming trading day 09:15 IST planet snapshot · absolute sidereal longitude 0°–360°.
      </div>
      <div style={{ color: C.muted, marginTop: 6 }}>
        <strong>Cycles:</strong> lower = floor(close/360)×360 · upper = ceil(close/360)×360.
      </div>
      <div style={{ color: C.muted, marginTop: 6 }}>
        <strong>Levels:</strong> L1=round(upper+deg), L2=round(lower+deg),
        L3=round(upper−deg), L4=round(lower−deg).
      </div>
      <div style={{ color: C.muted, marginTop: 6 }}>
        <strong>Safe zones:</strong> NIFTY ±100 · BANK NIFTY ±300.
      </div>
      <div style={{ color: C.muted, marginTop: 6 }}>
        <strong>Provisional (EagleBaba) policies</strong> — NOT original course facts:
        <ul style={{ margin: "4px 0 0 18px" }}>
          <li>{PROVISIONAL_POLICIES.EXACT_BOUNDARY}: exact 360-boundary uses previousClose + 360.</li>
          <li>{PROVISIONAL_POLICIES.CLUSTER}: cluster tolerance (5 pts NIFTY / 10 pts BANKNIFTY).</li>
          <li>{PROVISIONAL_POLICIES.EXACT_360}: exact-360 confluence window.</li>
          <li>{PROVISIONAL_POLICIES.ENTRY_DEVIATION}: maximum retest deviation.</li>
        </ul>
      </div>
    </div>
  );
}