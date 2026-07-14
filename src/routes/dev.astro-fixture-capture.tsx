import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { downloadBlob } from "@/lib/download";
import {
  detectSource,
  parsePlanetTable,
  type ParseResult,
  type ParseSource,
} from "@/lib/astro-fixture-parser";
import {
  validateFixture,
  type ExtendedReferenceFixture,
  type FixtureSource,
  type OriginalSourceEvidence,
} from "@/lib/astro-fixture-schema";

export const Route = createFileRoute("/dev/astro-fixture-capture")({
  component: FixtureCapture,
  head: () => ({
    meta: [
      { title: "Astro Fixture Capture (Phase 21.0C) | EagleBABA" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Dev-only fixture capture tool. Not indexed." },
    ],
  }),
});

const C = {
  bg: "var(--eb-bg)", card: "var(--eb-card)", border: "var(--eb-border)",
  green: "var(--eb-bull)", red: "var(--eb-bear)", gold: "var(--eb-accent)",
  text: "var(--eb-text)", muted: "var(--eb-muted)",
};

const SOURCES: FixtureSource[] = ["SWISS_EPHEMERIS", "DRIK_PANCHANG", "MPANCHANG", "PROKERALA", "OTHER"];
const EVIDENCE: OriginalSourceEvidence[] = [
  "UNKNOWN", "CONFIRMED_MEAN_GEOCENTRIC", "CONFIRMED_TRUE_GEOCENTRIC",
  "CONFIRMED_MEAN_TOPOCENTRIC", "CONFIRMED_TRUE_TOPOCENTRIC",
];

function FixtureCapture() {
  const enabled =
    import.meta.env.DEV ||
    (typeof window !== "undefined" && window.localStorage?.getItem("eb-diagnostics") === "on");
  if (!enabled) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.muted, display: "grid", placeItems: "center", padding: 24 }}>
        Dev-only. Enable with <code>localStorage.setItem(&quot;eb-diagnostics&quot;,&quot;on&quot;)</code>.
      </div>
    );
  }
  return <Editor />;
}

function Editor() {
  const [source, setSource] = useState<FixtureSource>("DRIK_PANCHANG");
  const [sourceUrl, setSourceUrl] = useState("");
  const [timestampIst, setTimestampIst] = useState("2024-01-01T09:00");
  const [ayanamshaMode, setAyanamshaMode] = useState("Lahiri (Chitrapaksha)");
  const [ayanamsha, setAyanamsha] = useState("24.15");
  const [nodeMode, setNodeMode] = useState<"mean" | "true">("mean");
  const [moonConvention, setMoonConvention] = useState<"geocentric" | "topocentric">("geocentric");
  const [evidence, setEvidence] = useState<OriginalSourceEvidence>("UNKNOWN");
  const [notes, setNotes] = useState("");
  const [paste, setPaste] = useState("");

  const parsed: ParseResult = useMemo(() => {
    if (!paste.trim()) return { source: "AUTO", rows: [], planets: [], confidence: 0, warnings: [], rawText: "" };
    const src: ParseSource =
      source === "SWISS_EPHEMERIS" ? "SWISS"
      : source === "DRIK_PANCHANG" ? "DRIK"
      : source === "MPANCHANG" ? "MPANCHANG"
      : source === "PROKERALA" ? "PROKERALA"
      : detectSource(paste);
    return parsePlanetTable(paste, src);
  }, [paste, source]);

  const utcIso = useMemo(() => {
    // IST is +5:30 fixed offset (no DST).
    if (!timestampIst) return "";
    const [d, t] = timestampIst.split("T");
    if (!d || !t) return "";
    const iso = `${d}T${t}:00+05:30`;
    const parsedDate = new Date(iso);
    return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
  }, [timestampIst]);

  const fixture: ExtendedReferenceFixture = useMemo(() => ({
    fixtureId: `${source}_${timestampIst}_${nodeMode}_${moonConvention}`,
    fixtureVersion: `${source.toLowerCase()}-${timestampIst.replace(/[:\-T]/g, "")}-${nodeMode}-${moonConvention}`,
    source,
    sourceUrl,
    capturedAt: new Date().toISOString(),
    timestampIso: utcIso,
    timestampIst,
    timestampUtc: utcIso,
    timezone: "Asia/Kolkata",
    location: { label: "Mumbai, Maharashtra, India", latitude: 19.076, longitude: 72.8777, elevationMeters: 14 },
    referenceEngine: source,
    ayanamshaMode,
    ayanamsha: Number(ayanamsha),
    nodeMode,
    moonConvention,
    planets: parsed.planets,
    notes: notes.trim() ||
      (evidence !== "UNKNOWN"
        ? `original-source: confirmed (${evidence})`
        : "original-source: NOT confirmed"),
    evidenceTier: "VERIFIED_FACT",
    originalSourceEvidence: evidence,
    originalSourceConfirmed: evidence !== "UNKNOWN",
    capture: "manual",
  }), [source, sourceUrl, utcIso, timestampIst, ayanamshaMode, ayanamsha, nodeMode, moonConvention, parsed.planets, notes, evidence]);

  const validation = useMemo(() => validateFixture(fixture), [fixture]);
  const json = JSON.stringify(fixture, null, 2);

  const label: React.CSSProperties = { display: "block", fontSize: 11, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 };
  const input: React.CSSProperties = { width: "100%", padding: "6px 8px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, fontFamily: "inherit" };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, padding: 24, fontSize: 13 }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, color: C.gold, letterSpacing: 1 }}>Astro Fixture Capture · Phase 21.0C</h1>
        <p style={{ margin: "6px 0 0", color: C.muted, maxWidth: 780 }}>
          Paste values from Swiss / Drik / MPanchang / Prokerala. Validated JSON
          is generated locally — nothing is written to disk from the browser.
          Download and add to <code>src/lib/__fixtures__/astro-reference/</code>.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div><label style={label}>Source</label>
          <select style={input} value={source} onChange={(e) => setSource(e.target.value as FixtureSource)}>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <div><label style={label}>Source URL</label>
          <input style={input} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." /></div>
        <div><label style={label}>Timestamp (IST, local)</label>
          <input style={input} type="datetime-local" value={timestampIst} onChange={(e) => setTimestampIst(e.target.value)} /></div>
        <div><label style={label}>Timestamp (UTC, derived)</label>
          <input style={input} value={utcIso} readOnly /></div>
        <div><label style={label}>Ayanamsha mode</label>
          <input style={input} value={ayanamshaMode} onChange={(e) => setAyanamshaMode(e.target.value)} /></div>
        <div><label style={label}>Ayanamsha (deg)</label>
          <input style={input} value={ayanamsha} onChange={(e) => setAyanamsha(e.target.value)} /></div>
        <div><label style={label}>Node</label>
          <select style={input} value={nodeMode} onChange={(e) => setNodeMode(e.target.value as "mean" | "true")}>
            <option value="mean">mean</option><option value="true">true</option>
          </select></div>
        <div><label style={label}>Moon</label>
          <select style={input} value={moonConvention} onChange={(e) => setMoonConvention(e.target.value as "geocentric" | "topocentric")}>
            <option value="geocentric">geocentric</option><option value="topocentric">topocentric</option>
          </select></div>
        <div><label style={label}>Original-source evidence</label>
          <select style={input} value={evidence} onChange={(e) => setEvidence(e.target.value as OriginalSourceEvidence)}>
            {EVIDENCE.map((e) => <option key={e} value={e}>{e}</option>)}
          </select></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={label}>Notes / evidence citation</label>
          <input style={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Swiss Ephemeris 2.10 (Lahiri, mean node) — page/screenshot reference" /></div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={label}>Paste planet table (tab / pipe / 2-space separated)</label>
        <textarea
          style={{ ...input, minHeight: 140, fontFamily: "monospace", fontSize: 12 }}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={"Sun\tSagittarius\t16 19 12\tPurva Ashadha\t3\tD\nMoon\tTaurus\t10 15 00\tRohini\t2\tD\n..."}
        />
        <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
          Parser confidence: <strong style={{ color: parsed.confidence >= 0.9 ? C.green : parsed.confidence >= 0.5 ? C.gold : C.red }}>
            {(parsed.confidence * 100).toFixed(0)}%
          </strong>
          {" · "}Rows: {parsed.rows.length} · Accepted: {parsed.planets.length}
          {parsed.warnings.length > 0 && (
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {parsed.warnings.map((w) => <li key={w} style={{ color: C.red }}>{w}</li>)}
            </ul>
          )}
        </div>
        {parsed.rows.some((r) => r.ambiguous) && (
          <div style={{ marginTop: 8, padding: 8, border: `1px dashed ${C.red}`, borderRadius: 4, color: C.muted, fontSize: 12 }}>
            <strong style={{ color: C.red }}>Ambiguous rows (excluded until fixed):</strong>
            <ul style={{ margin: "4px 0 0 16px" }}>
              {parsed.rows.filter((r) => r.ambiguous).map((r, i) => (
                <li key={i}><code>{r.raw}</code> — {r.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
          <div style={{ color: C.gold, fontWeight: 600, marginBottom: 6 }}>Validation</div>
          {validation.ok
            ? <div style={{ color: C.green }}>✓ Fixture passes schema validation.</div>
            : <ul style={{ margin: 0, paddingLeft: 16, color: C.red }}>
                {validation.errors.map((e, i) => <li key={i}><code>{e.path}</code>: {e.message}</li>)}
              </ul>}
          {validation.warnings.length > 0 && (
            <ul style={{ margin: "8px 0 0", paddingLeft: 16, color: C.muted, fontSize: 12 }}>
              {validation.warnings.map((w, i) => <li key={i}><code>{w.path}</code>: {w.message}</li>)}
            </ul>
          )}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 }}>
          <div style={{ color: C.gold, fontWeight: 600, marginBottom: 6 }}>Actions</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              disabled={!validation.ok}
              onClick={() => downloadBlob(json, `${fixture.fixtureVersion}.json`, "application/json")}
              style={{ background: validation.ok ? C.gold : C.border, color: C.bg, border: 0, padding: "6px 12px", borderRadius: 4, cursor: validation.ok ? "pointer" : "not-allowed", fontWeight: 600 }}
            >Download JSON</button>
            <button
              onClick={() => { void navigator.clipboard?.writeText(json); }}
              style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}
            >Copy JSON</button>
          </div>
          <p style={{ color: C.muted, fontSize: 12, marginTop: 8 }}>
            After download, place the file in <code>src/lib/__fixtures__/astro-reference/</code>
            and reload <a href="/dev/astro-audit" style={{ color: C.gold }}>/dev/astro-audit</a>.
          </p>
        </div>
      </div>

      <details style={{ marginTop: 16 }}>
        <summary style={{ color: C.muted, cursor: "pointer" }}>Preview normalized JSON</summary>
        <pre style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, fontSize: 11, overflowX: "auto" }}>{json}</pre>
      </details>
    </div>
  );
}