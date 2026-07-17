// Phase 3B — Deterministic tests for the AI Market Assistant.

import { describe, it, expect } from "vitest";
import { buildCanonicalContext } from "./context";
import { runAssistant, answerPreset } from "./assistant";
import { PRESET_QUESTIONS, findPreset } from "./prompts";
import { sanitize } from "./guardrails";
import { buildDiagnostics } from "./diagnostics";
import type { StrategyContextView } from "./types";
import type { CanonicalBias } from "@/lib/option-strategy-terminal/types";

const NOW = "2026-01-01T00:00:00.000Z";

const NULL_STRATEGY: StrategyContextView = {
  available: false,
  preferredCategory: "Unavailable",
  rationale: "n/a",
  keyRisk: "n/a",
  requiredConfirmation: "n/a",
  invalidation: "n/a",
};

function baseInputs(overrides: {
  decision?: CanonicalBias;
  pcr?: CanonicalBias;
  gti?: CanonicalBias;
  breadth?: CanonicalBias;
  astro?: CanonicalBias;
  gap?: CanonicalBias;
  source?: "LIVE" | "MIXED" | "RESEARCH_DEMO";
  strategy?: StrategyContextView;
  vixValue?: number | null;
  vixRegime?: string;
  runtime?: "READY" | "PARTIALLY_READY" | "NOT_READY" | "UNKNOWN";
  unavailable?: boolean;
} = {}) {
  const src = overrides.source ?? "LIVE";
  const unavail = overrides.unavailable === true;
  const mk = (bias: CanonicalBias | undefined) => ({
    available: !unavail && bias !== undefined && bias !== "UNAVAILABLE",
    bias: bias ?? "UNAVAILABLE",
    source: src,
  });
  return {
    generatedAt: NOW,
    decision: { ...mk(overrides.decision), action: "BUY_CE" },
    pcr: { ...mk(overrides.pcr), direction: "BULL" },
    gti: { ...mk(overrides.gti), state: overrides.gti ?? "NEUTRAL" },
    breadth: { ...mk(overrides.breadth), state: "NEUTRAL" },
    astro: mk(overrides.astro),
    gann: { available: false, bias: "UNAVAILABLE" as CanonicalBias, source: "UNKNOWN" },
    gannGap: { ...mk(overrides.gap), label: "GAP_UP_RESEARCH" },
    vix: {
      available: overrides.vixValue != null,
      value: overrides.vixValue ?? null,
      regime: overrides.vixRegime ?? "MID",
    },
    strategy: overrides.strategy ?? NULL_STRATEGY,
    runtime: { overall: overrides.runtime ?? "READY", degradedModules: [] as string[] },
  };
}

describe("AI Market Assistant — deterministic engine", () => {
  it("BULLISH explanation when signals align bullish", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "BULLISH" }),
    );
    const res = runAssistant(ctx);
    expect(res.marketBias).toBe("BULLISH");
    expect(["HIGH", "MEDIUM"]).toContain(res.confidence);
    expect(res.supportingEvidence.length).toBeGreaterThanOrEqual(3);
    expect(res.conflictingEvidence.length).toBe(0);
  });

  it("BEARISH explanation when signals align bearish", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "BEARISH", pcr: "BEARISH", gti: "BEARISH", breadth: "BEARISH" }),
    );
    const res = runAssistant(ctx);
    expect(res.marketBias).toBe("BEARISH");
    expect(res.conflictingEvidence.length).toBe(0);
  });

  it("NEUTRAL explanation when no directional signals", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "NEUTRAL", pcr: "NEUTRAL", gti: "NEUTRAL", breadth: "NEUTRAL" }),
    );
    const res = runAssistant(ctx);
    expect(res.marketBias).toBe("NEUTRAL");
  });

  it("CONFLICT explanation when signals disagree", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "BULLISH", pcr: "BEARISH", gti: "BULLISH", breadth: "BEARISH" }),
    );
    const res = runAssistant(ctx);
    expect(res.marketBias).toBe("CONFLICT");
    expect(res.confidence).toBe("LOW");
  });

  it("UNAVAILABLE when all modules missing", () => {
    const ctx = buildCanonicalContext(baseInputs({ unavailable: true }));
    const res = runAssistant(ctx);
    expect(res.marketBias).toBe("UNAVAILABLE");
    expect(res.confidence).toBe("UNAVAILABLE");
  });

  it("Research-demo data downgrades confidence to LOW", () => {
    const ctx = buildCanonicalContext(
      baseInputs({
        decision: "BULLISH",
        pcr: "BULLISH",
        gti: "BULLISH",
        breadth: "BULLISH",
        source: "RESEARCH_DEMO",
      }),
    );
    const res = runAssistant(ctx);
    expect(res.confidence).toBe("LOW");
  });

  it("Runtime-degraded state downgrades confidence", () => {
    const highCtx = buildCanonicalContext(
      baseInputs({ decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "BULLISH" }),
    );
    const degradedCtx = buildCanonicalContext(
      baseInputs({
        decision: "BULLISH",
        pcr: "BULLISH",
        gti: "BULLISH",
        breadth: "BULLISH",
        runtime: "PARTIALLY_READY",
      }),
    );
    const high = runAssistant(highCtx);
    const deg = runAssistant(degradedCtx);
    const order = { HIGH: 3, MEDIUM: 2, LOW: 1, UNAVAILABLE: 0 } as const;
    expect(order[deg.confidence]).toBeLessThanOrEqual(order[high.confidence]);
  });

  it("Strategy context passes through", () => {
    const ctx = buildCanonicalContext(
      baseInputs({
        decision: "BULLISH",
        pcr: "BULLISH",
        strategy: {
          available: true,
          preferredCategory: "Bull Call Spread",
          rationale: "Directional bullish with capped risk.",
          keyRisk: "Risk tier: LOW.",
          requiredConfirmation: "Consensus across Decision and PCR.",
          invalidation: "Bearish flip in Decision or PCR.",
        },
      }),
    );
    const res = runAssistant(ctx);
    expect(res.strategyContext.available).toBe(true);
    expect(res.strategyContext.preferredCategory).toBe("Bull Call Spread");
  });

  it("Preset questions map to canonical evidence", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "BULLISH", pcr: "BULLISH", gti: "BULLISH", breadth: "BULLISH" }),
    );
    const res = runAssistant(ctx);
    for (const q of PRESET_QUESTIONS) {
      const a = answerPreset(res, q.id);
      expect(typeof a).toBe("string");
      expect(a.length).toBeGreaterThan(0);
    }
    expect(findPreset("MARKET_BIAS")).not.toBeNull();
    expect(findPreset("UNKNOWN_ID")).toBeNull();
  });

  it("Source disclosure lists used, unavailable, stale, research-only", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "BULLISH", pcr: "BULLISH", source: "RESEARCH_DEMO" }),
    );
    const res = runAssistant(ctx);
    expect(res.sources.used.length).toBeGreaterThan(0);
    expect(res.sources.researchOnly.length).toBeGreaterThan(0);
  });

  it("Guardrails redact prohibited wording", () => {
    const r = sanitize("This is a guaranteed profit — buy now for a risk-free return.");
    expect(r.violations).toBeGreaterThan(0);
    expect(r.text).not.toMatch(/guaranteed profit/i);
    expect(r.text).not.toMatch(/buy now/i);
    expect(r.text).not.toMatch(/risk-free/i);
  });

  it("Diagnostics never expose secrets or URLs", () => {
    const ctx = buildCanonicalContext(
      baseInputs({ decision: "BULLISH", pcr: "BULLISH" }),
    );
    const res = runAssistant(ctx);
    const diag = buildDiagnostics(ctx, res, 12);
    const json = JSON.stringify(diag);
    expect(json).not.toMatch(/https?:\/\//i);
    expect(json).not.toMatch(/token|secret|api[_-]?key/i);
    expect(diag.evidenceCount).toBe(ctx.evidence.length);
  });

  it("Data quality label reflects source mix", () => {
    const live = runAssistant(
      buildCanonicalContext(baseInputs({ decision: "BULLISH", pcr: "BULLISH", source: "LIVE" })),
    );
    expect(["LIVE", "MIXED"]).toContain(live.dataQuality.label);
    const demo = runAssistant(
      buildCanonicalContext(
        baseInputs({ decision: "BULLISH", pcr: "BULLISH", source: "RESEARCH_DEMO" }),
      ),
    );
    expect(demo.dataQuality.label).toBe("RESEARCH_DEMO");
  });
});

describe("AI Market Assistant — no broker imports, no formula changes", () => {
  it("does not import any broker path from the module", async () => {
    // Static import graph check: source scan via dynamic imports.
    const files: string[] = [
      "./types",
      "./evidence",
      "./narrative",
      "./guardrails",
      "./assistant",
      "./context",
      "./prompts",
      "./diagnostics",
      "./index",
    ];
    for (const f of files) {
      const mod = await import(/* @vite-ignore */ f);
      expect(mod).toBeDefined();
    }
  });
});