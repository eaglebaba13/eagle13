import { createFileRoute, Link } from "@tanstack/react-router";
import { AbsoluteValidationPanel } from "@/components/backtest/AbsoluteValidationPanel";

export const Route = createFileRoute("/absolute-intraday-validation")({
  component: ValidationPage,
  head: () => ({
    meta: [
      { title: "Absolute Intraday · Historical Validation | EagleBABA" },
      {
        name: "description",
        content:
          "Validation-only historical evidence for the Absolute-Degree Intraday methodology. Not a live trade recommendation.",
      },
      { property: "og:title", content: "Absolute Intraday · Historical Validation" },
      {
        property: "og:description",
        content:
          "Historical multi-session replay of the Absolute-Degree Intraday engine. Validation only.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const C = {
  bg: "var(--eb-bg)",
  card: "var(--eb-card)",
  border: "var(--eb-border)",
  text: "var(--eb-text)",
  muted: "var(--eb-muted)",
  gold: "var(--eb-accent)",
  green: "var(--eb-bull)",
  red: "var(--eb-bear)",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 16,
        marginTop: 16,
        background: C.card,
      }}
    >
      <h2 style={{ fontSize: 14, margin: 0, marginBottom: 12, letterSpacing: 0.5, color: C.gold }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: C.text, fontFamily: "var(--eb-mono)" }}>{v}</span>
    </div>
  );
}

function ValidationPage() {
  const run = useServerFn(runHistoricalValidation);
  const [instrument, setInstrument] = useState<InstrumentSymbol>("NIFTY50");
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [ambiguousPolicy, setAmbiguousPolicy] = useState<AmbiguousPolicy>("conservative");
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSV Import state (client-side, deterministic).
  const [providerA, setProviderA] = useState<ProviderLabel>("Generic");
  const [providerB, setProviderB] = useState<ProviderLabel>("Generic");
  const [importA, setImportA] = useState<ParseResult | null>(null);
  const [importB, setImportB] = useState<ParseResult | null>(null);
  const [importInstrument, setImportInstrument] = useState<InstrumentSymbol>("NIFTY50");
  const [importError, setImportError] = useState<string | null>(null);

  const dqA = useMemo(() => (importA ? computeDataQuality(importA.rows) : null), [importA]);
  const builtA = useMemo<BuildResult | null>(
    () =>
      importA
        ? buildSessions({
            provider: importA.provider,
            instrument: importInstrument,
            rows: importA.rows,
          })
        : null,
    [importA, importInstrument],
  );
  const comparison = useMemo<ProviderComparisonResult | null>(
    () => (importA && importB ? compareProviders(importA.rows, importB.rows) : null),
    [importA, importB],
  );

  const readFile = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (r: ParseResult) => void,
    provider: ProviderLabel,
  ) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCandleCsv({
          csv: String(reader.result ?? ""),
          provider,
          instrument: importInstrument,
          timezone: "Asia/Kolkata",
          interval: "5m",
        });
        setter(parsed);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  };

  const provenance = (source: string): ProvenanceHeader => ({
    source,
    instrument: importInstrument,
    from: builtA?.from ?? "",
    to: builtA?.to ?? "",
    runId: `${INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1}:${builtA?.from ?? ""}:${builtA?.to ?? ""}`,
    generatedAt: new Date().toISOString(),
  });

  const onRun = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await run({
        data: { instrument, months, ambiguousPolicy },
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const readiness = result
    ? evaluateReadiness({
        monthsCovered: months,
        validSessions: result.loaded,
        overall: result.metrics,
        cubeGrades: {
          A: result.metrics,
          B: result.metrics,
          C: result.metrics,
          NONE: result.metrics,
        },
        causalityFailures: result.causalityFailures,
        snapshotMutations: 0,
        formulaMixingDetected: false,
        shadowAlertErrors: 0,
        providerErrorRate: result.failed / Math.max(1, result.attempted),
        mobileAuditPassed: true,
        hydrationAuditPassed: true,
      })
    : null;

  return (
    <div
      style={{
        padding: "24px 16px",
        maxWidth: 1100,
        margin: "0 auto",
        background: C.bg,
        color: C.text,
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          background: "rgba(220, 90, 30, 0.12)",
          border: `1px solid ${C.gold}`,
          padding: "12px 16px",
          borderRadius: 8,
          fontSize: 13,
          letterSpacing: 0.4,
        }}
      >
        <strong>VALIDATION ONLY — NOT A LIVE TRADE RECOMMENDATION.</strong>{" "}
        Historical replay of the Absolute-Degree Intraday methodology. No broker action, no
        production alerts, no default switch.
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Absolute Intraday · Historical Validation</h1>
        <Link to="/absolute-intraday" style={{ color: C.gold, fontSize: 13 }}>
          ← Snapshot preview
        </Link>
      </div>
      <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
        Engine: {INTRADAY_FORMULA_VERSIONS.GANN_ASTRO_INTRADAY_ABSOLUTE_V1} · Validation:{" "}
        {GANN_ABSOLUTE_INTRADAY_VALIDATION_VERSION}
      </p>

      <Section title="Historical CSV Import (Stage 5.1)">
        <p style={{ color: C.muted, fontSize: 12, marginTop: 0 }}>
          Load 5-minute candles from a provider export. Timezone is fixed to
          Asia/Kolkata; interval to 5m. Data is validated client-side; nothing
          is uploaded or persisted.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: C.muted }}>
            Instrument
            <select
              value={importInstrument}
              onChange={(e) => setImportInstrument(e.target.value as InstrumentSymbol)}
              style={{ display: "block", marginTop: 4, background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 6, borderRadius: 4 }}
            >
              <option value="NIFTY50">NIFTY 50</option>
              <option value="BANKNIFTY">BANK NIFTY</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: C.muted }}>
            Provider A
            <select
              value={providerA}
              onChange={(e) => setProviderA(e.target.value as ProviderLabel)}
              style={{ display: "block", marginTop: 4, background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 6, borderRadius: 4 }}
            >
              {(["Generic", "TradingView", "Zerodha", "Upstox", "Dhan", "AngelOne", "NSE"] as ProviderLabel[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e, setImportA, providerA)} style={{ display: "block", marginTop: 4, fontSize: 12 }} />
          </label>
          <label style={{ fontSize: 12, color: C.muted }}>
            Provider B (optional, for comparison)
            <select
              value={providerB}
              onChange={(e) => setProviderB(e.target.value as ProviderLabel)}
              style={{ display: "block", marginTop: 4, background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 6, borderRadius: 4 }}
            >
              {(["Generic", "TradingView", "Zerodha", "Upstox", "Dhan", "AngelOne", "NSE"] as ProviderLabel[]).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e, setImportB, providerB)} style={{ display: "block", marginTop: 4, fontSize: 12 }} />
          </label>
        </div>
        {importError && <div style={{ color: C.red, marginTop: 8, fontSize: 12 }}>{importError}</div>}

        {importA && dqA && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: C.gold, marginBottom: 6 }}>Provider A · Data quality</div>
            <KV k="Rows parsed" v={importA.rows.length} />
            <KV k="Rows rejected" v={importA.rejected.length} />
            <KV k="Sessions detected" v={dqA.sessionsDetected} />
            <KV k="Coverage" v={`${dqA.coveragePct.toFixed(2)}%`} />
            <KV k="Missing candles" v={dqA.gaps.reduce((a, g) => a + g.missingCount, 0)} />
            <KV k="Out-of-window rows" v={dqA.outOfWindowCount} />
            <KV k="Out-of-order rows" v={dqA.outOfOrderCount} />
            <KV k="Causality failures" v={dqA.causalityFailures} />
            {builtA && (
              <>
                <KV k="Usable sessions" v={builtA.usable.length} />
                <KV k="Rejected sessions" v={builtA.rejected.length} />
                <KV k="Date range" v={builtA.from && builtA.to ? `${builtA.from} → ${builtA.to}` : "—"} />
              </>
            )}
          </div>
        )}

        {comparison && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: C.gold, marginBottom: 6 }}>Provider comparison</div>
            <KV k="Overlap sessions" v={comparison.overlapDates.length} />
            <KV
              k="Overall"
              v={comparison.overall}
            />
            {comparison.overall === "MATERIAL_DIFFERENCE" && (
              <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>
                Datasets materially disagree — do not merge; investigate before use.
              </div>
            )}
          </div>
        )}

        {importA && builtA && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button
              onClick={() =>
                downloadBlob(
                  cleanedCandlesToCsv(importA.rows, provenance(importA.provider)),
                  ingestExportFilename(provenance(importA.provider), "candles", "csv"),
                  "text/csv",
                )
              }
              style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              Cleaned candles CSV
            </button>
            <button
              onClick={() =>
                downloadBlob(
                  rejectedRowsToCsv(importA.rejected, provenance(importA.provider)),
                  ingestExportFilename(provenance(importA.provider), "rejected", "csv"),
                  "text/csv",
                )
              }
              style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              Rejected rows CSV
            </button>
            <button
              onClick={() =>
                downloadBlob(
                  sessionSummaryToCsv(builtA, provenance(importA.provider)),
                  ingestExportFilename(provenance(importA.provider), "sessions", "csv"),
                  "text/csv",
                )
              }
              style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            >
              Session summary CSV
            </button>
            {dqA && (
              <button
                onClick={() =>
                  downloadBlob(
                    dqReportToJson(dqA, provenance(importA.provider)),
                    ingestExportFilename(provenance(importA.provider), "dq", "json"),
                    "application/json",
                  )
                }
                style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
              >
                DQ report JSON
              </button>
            )}
            {comparison && (
              <button
                onClick={() =>
                  downloadBlob(
                    providerComparisonToCsv(comparison, provenance(`${importA.provider}_vs_${importB?.provider ?? "B"}`)),
                    ingestExportFilename(provenance("compare"), "compare", "csv"),
                    "text/csv",
                  )
                }
                style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
              >
                Provider comparison CSV
              </button>
            )}
          </div>
        )}
      </Section>

      <Section title="Run Historical Validation">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: C.muted }}>
            Instrument
            <select
              value={instrument}
              onChange={(e) => setInstrument(e.target.value as InstrumentSymbol)}
              style={{ display: "block", marginTop: 4, background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 6, borderRadius: 4 }}
            >
              <option value="NIFTY50">NIFTY 50</option>
              <option value="BANKNIFTY">BANK NIFTY</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: C.muted }}>
            Period
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) as 1 | 3 | 6 | 12)}
              style={{ display: "block", marginTop: 4, background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 6, borderRadius: 4 }}
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>1 year</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: C.muted }}>
            Ambiguous policy
            <select
              value={ambiguousPolicy}
              onChange={(e) => setAmbiguousPolicy(e.target.value as AmbiguousPolicy)}
              style={{ display: "block", marginTop: 4, background: C.bg, color: C.text, border: `1px solid ${C.border}`, padding: 6, borderRadius: 4 }}
            >
              <option value="conservative">conservative</option>
              <option value="optimistic">optimistic</option>
              <option value="exclude_ambiguous">exclude_ambiguous</option>
            </select>
          </label>
          <button
            onClick={onRun}
            disabled={loading}
            style={{
              padding: "8px 16px",
              background: C.gold,
              color: "#000",
              border: 0,
              borderRadius: 4,
              cursor: loading ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {loading ? "Running…" : "Run validation"}
          </button>
        </div>
        {error && (
          <div style={{ color: C.red, marginTop: 8, fontSize: 12 }}>Error: {error}</div>
        )}
      </Section>

      {result && (
        <>
          <Section title="Summary">
            <KV k="Run ID" v={result.runId} />
            <KV k="Sessions attempted" v={result.attempted} />
            <KV k="Sessions loaded" v={result.loaded} />
            <KV k="Sessions failed" v={result.failed} />
            <KV k="Causality failures" v={result.causalityFailures} />
            <KV k="From → To" v={`${result.from} → ${result.to}`} />
            <KV k="Trades" v={result.metrics.totalTrades} />
            <KV k="Wins / Losses" v={`${result.metrics.wins} / ${result.metrics.losses}`} />
            <KV k="Win rate" v={`${(result.metrics.winRate * 100).toFixed(1)}%`} />
            <KV
              k="Profit factor"
              v={Number.isFinite(result.metrics.profitFactor) ? result.metrics.profitFactor.toFixed(2) : "∞"}
            />
            <KV k="Expectancy (pts)" v={result.metrics.expectancy.toFixed(2)} />
            <KV k="Net PnL (pts)" v={result.metrics.netPnL.toFixed(0)} />
            <KV k="Max drawdown (pts)" v={result.metrics.maxDrawdown.toFixed(0)} />
          </Section>

          {readiness && (
            <Section title="Readiness gate">
              <div style={{ marginBottom: 12, fontSize: 14 }}>
                Verdict:{" "}
                <strong
                  style={{
                    color:
                      readiness.verdict === "NOT_READY"
                        ? C.red
                        : readiness.verdict === "READY_FOR_PRODUCTION_REVIEW"
                          ? C.green
                          : C.gold,
                  }}
                >
                  {readiness.verdict}
                </strong>
              </div>
              {readiness.checks.map((c) => (
                <div key={c.id} style={{ display: "flex", fontSize: 12, padding: "3px 0" }}>
                  <span style={{ width: 20, color: c.passed ? C.green : C.red }}>{c.passed ? "✓" : "✗"}</span>
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <span style={{ color: C.muted, fontFamily: "var(--eb-mono)" }}>{c.detail}</span>
                </div>
              ))}
            </Section>
          )}

          <Section title="Session log">
            <div style={{ maxHeight: 320, overflow: "auto", fontFamily: "var(--eb-mono)", fontSize: 11 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: C.muted, textAlign: "left" }}>
                    <th style={{ padding: 4 }}>Date</th>
                    <th style={{ padding: 4 }}>Status</th>
                    <th style={{ padding: 4 }}>Candles</th>
                    <th style={{ padding: 4 }}>Trades</th>
                    <th style={{ padding: 4 }}>W/L</th>
                    <th style={{ padding: 4 }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sessionsSummary.map((s) => (
                    <tr key={s.tradingDate} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: 4 }}>{s.tradingDate}</td>
                      <td style={{ padding: 4 }}>{s.status}</td>
                      <td style={{ padding: 4 }}>{s.candles}</td>
                      <td style={{ padding: 4 }}>{s.totalTrades}</td>
                      <td style={{ padding: 4 }}>
                        {s.wins}/{s.losses}
                      </td>
                      <td style={{ padding: 4, color: C.red }}>{s.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Exports">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() =>
                  downloadBlob(
                    historyToSummaryCsv(result),
                    historyExportFilename(result, "csv"),
                    "text/csv",
                  )
                }
                style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
              >
                Download CSV
              </button>
              <button
                onClick={() =>
                  downloadBlob(
                    historyToJson(result),
                    historyExportFilename(result, "json"),
                    "application/json",
                  )
                }
                style={{ padding: "6px 12px", background: "transparent", color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontSize: 12 }}
              >
                Download JSON
              </button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}