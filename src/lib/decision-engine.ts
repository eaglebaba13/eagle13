// Phase 17 — Institutional Decision Intelligence Engine.
//
// Pure, deterministic, client-safe aggregator that turns already-computed
// module outputs into a single explainable trade recommendation. This file
// NEVER recomputes Astro, Signals, Support/Resistance, Backtest, Replay, or
// Options analytics — it only consumes them. Every score is traceable back
// to a specific input, and missing modules cause a transparent weight
// redistribution + confidence penalty rather than a silent guess.

export type Bias = "BULL" | "BEAR" | "NEUTRAL";

export type ModuleKey =
  | "astro"
  | "options"
  | "pcr"
  | "breadth"
  | "sector"
  | "vix"
  | "historical"
  | "replay";

export type ModuleSignal = {
  key: ModuleKey;
  label: string;
  bias: Bias;
  /** Signed strength in [-1, +1]. Positive = bullish, negative = bearish. */
  score: number;
  /** Per-signal confidence in [0, 1]. Multiplies effective contribution. */
  confidence: number;
  /** Prior weight in [0, 1]. Weights of absent modules are redistributed. */
  weight: number;
  present: boolean;
  note: string;
};

export type DecisionAction =
  | "STRONG_BUY_CE"
  | "BUY_CE"
  | "WAIT"
  | "BUY_PE"
  | "STRONG_BUY_PE";

export type Regime =
  | "BULL_TREND"
  | "BEAR_TREND"
  | "RANGE"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY"
  | "TRANSITION";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export type Grade = "A+" | "A" | "B" | "C" | "D";

export type Contribution = {
  key: ModuleKey;
  label: string;
  bias: Bias;
  priorWeight: number;
  effectiveWeight: number;
  signedScore: number;
  contribution: number; // effectiveWeight * signedScore * confidence
  present: boolean;
  note: string;
};

export type Conflict = {
  a: ModuleKey;
  b: ModuleKey;
  reason: string;
};

export type ChecklistItem = {
  key: string;
  label: string;
  pass: boolean;
  reason: string;
};

export type DecisionContext = {
  vix: number | null;
  historicalAccuracy: number | null; // 0..100 win-rate proxy
  marketOpen: boolean;
  generatedAt?: string;
};

export type Decision = {
  action: DecisionAction;
  netScore: number;     // -1..+1
  rawScore: number;     // pre-penalty net
  confidence: number;   // 0..100
  regime: Regime;
  risk: { level: RiskLevel; reasons: string[] };
  grade: Grade;
  contributions: Contribution[];
  conflicts: Conflict[];
  checklist: ChecklistItem[];
  positives: string[];
  negatives: string[];
  missing: string[];
  penalties: { reason: string; delta: number }[];
  explanation: string;
  vix: number | null;
  historicalAccuracy: number | null;
  marketOpen: boolean;
  generatedAt: string;
};

/* --------------------------- Helpers --------------------------- */

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function biasFromScore(s: number): Bias {
  if (s > 0.1) return "BULL";
  if (s < -0.1) return "BEAR";
  return "NEUTRAL";
}

function biasSign(b: Bias): 1 | -1 | 0 {
  if (b === "BULL") return 1;
  if (b === "BEAR") return -1;
  return 0;
}

function labelFor(k: ModuleKey): string {
  switch (k) {
    case "astro": return "Astro";
    case "options": return "Options";
    case "pcr": return "PCR";
    case "breadth": return "Market Breadth";
    case "sector": return "Sector Rotation";
    case "vix": return "VIX";
    case "historical": return "Historical Accuracy";
    case "replay": return "Replay";
  }
}

/* --------------------------- Core --------------------------- */

/**
 * Aggregate module signals into a single, fully-explainable decision.
 * Deterministic: same inputs → same outputs. Never mutates its inputs.
 */
export function computeDecision(
  rawSignals: ModuleSignal[],
  ctx: DecisionContext,
): Decision {
  const generatedAt = ctx.generatedAt ?? new Date().toISOString();

  // Normalise: sanitise numbers and ensure a label.
  const signals: ModuleSignal[] = rawSignals.map((s) => ({
    ...s,
    label: s.label || labelFor(s.key),
    score: clamp(Number.isFinite(s.score) ? s.score : 0, -1, 1),
    confidence: clamp(Number.isFinite(s.confidence) ? s.confidence : 0, 0, 1),
    weight: clamp(Number.isFinite(s.weight) ? s.weight : 0, 0, 1),
  }));

  // Redistribute the weight of absent modules across the present ones so
  // the effective weights still sum to the total prior weight (~1).
  const totalPrior = signals.reduce((a, s) => a + s.weight, 0);
  const presentWeight = signals
    .filter((s) => s.present)
    .reduce((a, s) => a + s.weight, 0);
  const scale = presentWeight > 0 ? totalPrior / presentWeight : 0;

  const contributions: Contribution[] = signals.map((s) => {
    const eff = s.present ? s.weight * scale : 0;
    const contribution = eff * s.score * s.confidence;
    return {
      key: s.key,
      label: s.label,
      bias: s.bias,
      priorWeight: s.weight,
      effectiveWeight: eff,
      signedScore: s.score,
      contribution,
      present: s.present,
      note: s.note,
    };
  });

  const rawScore = clamp(
    contributions.reduce((a, c) => a + c.contribution, 0),
    -1,
    1,
  );

  // Conflicts: pairs of present modules whose biases disagree (BULL vs BEAR).
  const present = contributions.filter((c) => c.present && c.bias !== "NEUTRAL");
  const conflicts: Conflict[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if (present[i].bias !== present[j].bias) {
        conflicts.push({
          a: present[i].key,
          b: present[j].key,
          reason: `${present[i].label} ${present[i].bias} vs ${present[j].label} ${present[j].bias}`,
        });
      }
    }
  }

  // Penalties applied to confidence (not to netScore, so bias direction is
  // preserved even when confidence is capped down).
  const penalties: { reason: string; delta: number }[] = [];
  let confidence = Math.abs(rawScore) * 100;

  const missing = contributions.filter((c) => !c.present);
  if (missing.length > 0) {
    const delta = Math.min(25, missing.length * 6);
    penalties.push({
      reason: `${missing.length} module(s) unavailable`,
      delta: -delta,
    });
    confidence -= delta;
  }
  if (conflicts.length > 0) {
    const delta = Math.min(30, conflicts.length * 6);
    penalties.push({ reason: `${conflicts.length} module conflict(s)`, delta: -delta });
    confidence -= delta;
  }
  if (ctx.historicalAccuracy != null) {
    if (ctx.historicalAccuracy < 55) {
      const delta = 15;
      penalties.push({ reason: "Historical accuracy below 55%", delta: -delta });
      confidence -= delta;
    } else if (ctx.historicalAccuracy >= 70) {
      const delta = 5;
      penalties.push({ reason: "Historical accuracy ≥ 70%", delta: +delta });
      confidence += delta;
    }
  }
  if (!ctx.marketOpen) {
    penalties.push({ reason: "Market closed", delta: -10 });
    confidence -= 10;
  }
  confidence = clamp(confidence, 0, 100);

  // Regime.
  const vix = ctx.vix;
  const regime = classifyRegime(rawScore, vix, conflicts.length);

  // Risk.
  const risk = assessRisk({
    vix,
    confidence,
    conflicts: conflicts.length,
    marketOpen: ctx.marketOpen,
    missing: missing.length,
  });

  // Checklist — a STRONG_* action is only allowed when every core module is
  // present AND agrees with the net direction.
  const netBias = biasFromScore(rawScore);
  const dir = biasSign(netBias);
  const coreKeys: ModuleKey[] = ["astro", "options", "pcr", "breadth"];
  const checklist: ChecklistItem[] = contributions.map((c) => {
    const isCore = coreKeys.includes(c.key);
    let pass = false;
    let reason: string;
    if (!c.present) {
      reason = "Module data unavailable";
    } else if (dir === 0) {
      pass = c.bias === "NEUTRAL";
      reason = pass ? "Consistent with neutral bias" : `${c.label} disagrees (${c.bias})`;
    } else if (dir === 1) {
      pass = c.bias === "BULL" || (!isCore && c.bias === "NEUTRAL");
      reason = pass ? "Bullish confirmation" : `${c.label} not bullish (${c.bias})`;
    } else {
      pass = c.bias === "BEAR" || (!isCore && c.bias === "NEUTRAL");
      reason = pass ? "Bearish confirmation" : `${c.label} not bearish (${c.bias})`;
    }
    // Risk & session are additional checklist items handled below.
    return { key: c.key, label: c.label, pass, reason };
  });
  checklist.push({
    key: "risk",
    label: "Risk acceptable",
    pass: risk.level === "LOW" || risk.level === "MEDIUM",
    reason: risk.reasons[0] ?? `Risk level ${risk.level}`,
  });
  checklist.push({
    key: "session",
    label: "Market session",
    pass: ctx.marketOpen,
    reason: ctx.marketOpen ? "Market open" : "Market closed",
  });

  const coreAllPassed = checklist
    .filter((c) => coreKeys.includes(c.key as ModuleKey))
    .every((c) => c.pass);
  const allPassed = checklist.every((c) => c.pass);

  // Action mapping.
  const action = mapAction(rawScore, confidence, coreAllPassed, allPassed);

  // Grade.
  const agreeing = contributions.filter(
    (c) => c.present && biasSign(c.bias) === dir && dir !== 0,
  ).length;
  const grade = gradeDecision(confidence, agreeing, conflicts.length, missing.length);

  // Positives / negatives / missing summaries.
  const positives = contributions
    .filter((c) => c.present && biasSign(c.bias) === dir && dir !== 0)
    .map((c) => `${c.label}: ${c.note || c.bias.toLowerCase()}`);
  const negatives = contributions
    .filter((c) => c.present && biasSign(c.bias) !== dir && biasSign(c.bias) !== 0)
    .map((c) => `${c.label}: ${c.note || c.bias.toLowerCase()}`);
  const missingLabels = missing.map((m) => m.label);

  const explanation = buildExplanation({
    action,
    confidence,
    positives,
    negatives,
    conflicts,
    regime,
    risk,
    historicalAccuracy: ctx.historicalAccuracy,
  });

  return {
    action,
    netScore: rawScore,
    rawScore,
    confidence,
    regime,
    risk,
    grade,
    contributions,
    conflicts,
    checklist,
    positives,
    negatives,
    missing: missingLabels,
    penalties,
    explanation,
    vix,
    historicalAccuracy: ctx.historicalAccuracy,
    marketOpen: ctx.marketOpen,
    generatedAt,
  };
}

/* --------------------------- Sub-routines --------------------------- */

export function classifyRegime(
  netScore: number,
  vix: number | null,
  conflictCount: number,
): Regime {
  if (conflictCount >= 3) return "TRANSITION";
  if (vix != null && vix >= 20) return "HIGH_VOLATILITY";
  if (vix != null && vix < 12) return "LOW_VOLATILITY";
  if (netScore >= 0.35) return "BULL_TREND";
  if (netScore <= -0.35) return "BEAR_TREND";
  return "RANGE";
}

export function assessRisk(inp: {
  vix: number | null;
  confidence: number;
  conflicts: number;
  marketOpen: boolean;
  missing: number;
}): { level: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (inp.vix != null && inp.vix >= 22) {
    reasons.push(`Elevated VIX (${inp.vix.toFixed(2)})`);
    score += 3;
  } else if (inp.vix != null && inp.vix >= 17) {
    reasons.push(`Rising VIX (${inp.vix.toFixed(2)})`);
    score += 1;
  }
  if (inp.conflicts >= 3) {
    reasons.push(`${inp.conflicts} module conflicts`);
    score += 2;
  } else if (inp.conflicts > 0) {
    reasons.push(`${inp.conflicts} module conflict(s)`);
    score += 1;
  }
  if (inp.confidence < 45) {
    reasons.push("Low aggregate confidence");
    score += 2;
  }
  if (!inp.marketOpen) {
    reasons.push("Market closed — informational only");
    score += 1;
  }
  if (inp.missing >= 3) {
    reasons.push(`${inp.missing} module(s) missing`);
    score += 1;
  }
  let level: RiskLevel = "LOW";
  if (score >= 6) level = "VERY_HIGH";
  else if (score >= 4) level = "HIGH";
  else if (score >= 2) level = "MEDIUM";
  if (reasons.length === 0) reasons.push("All modules aligned within tolerance");
  return { level, reasons };
}

export function mapAction(
  netScore: number,
  confidence: number,
  coreAllAgree: boolean,
  allChecklistPass: boolean,
): DecisionAction {
  if (netScore >= 0.55 && confidence >= 70 && coreAllAgree && allChecklistPass)
    return "STRONG_BUY_CE";
  if (netScore >= 0.2 && confidence >= 45) return "BUY_CE";
  if (netScore <= -0.55 && confidence >= 70 && coreAllAgree && allChecklistPass)
    return "STRONG_BUY_PE";
  if (netScore <= -0.2 && confidence >= 45) return "BUY_PE";
  return "WAIT";
}

export function gradeDecision(
  confidence: number,
  agreeingCount: number,
  conflictCount: number,
  missingCount: number,
): Grade {
  if (confidence >= 85 && agreeingCount >= 5 && conflictCount === 0 && missingCount === 0)
    return "A+";
  if (confidence >= 70 && agreeingCount >= 4 && conflictCount <= 1) return "A";
  if (confidence >= 55 && agreeingCount >= 3) return "B";
  if (confidence >= 40) return "C";
  return "D";
}

function buildExplanation(inp: {
  action: DecisionAction;
  confidence: number;
  positives: string[];
  negatives: string[];
  conflicts: Conflict[];
  regime: Regime;
  risk: { level: RiskLevel; reasons: string[] };
  historicalAccuracy: number | null;
}): string {
  const head = `${humanAction(inp.action)} at ${Math.round(inp.confidence)}% confidence.`;
  const parts: string[] = [head, `Regime: ${humanRegime(inp.regime)}.`];
  if (inp.positives.length) parts.push(`Supporting: ${inp.positives.slice(0, 6).join("; ")}.`);
  if (inp.negatives.length) parts.push(`Against: ${inp.negatives.slice(0, 4).join("; ")}.`);
  if (inp.conflicts.length)
    parts.push(
      `Conflicts: ${inp.conflicts.slice(0, 3).map((c) => c.reason).join("; ")}.`,
    );
  if (inp.historicalAccuracy != null)
    parts.push(`Historical accuracy ${Math.round(inp.historicalAccuracy)}%.`);
  parts.push(`Risk ${inp.risk.level.replace("_", " ").toLowerCase()}.`);
  return parts.join(" ");
}

export function humanAction(a: DecisionAction): string {
  switch (a) {
    case "STRONG_BUY_CE": return "STRONG BUY CE";
    case "BUY_CE": return "BUY CE";
    case "WAIT": return "WAIT";
    case "BUY_PE": return "BUY PE";
    case "STRONG_BUY_PE": return "STRONG BUY PE";
  }
}

export function humanRegime(r: Regime): string {
  switch (r) {
    case "BULL_TREND": return "Bullish trend";
    case "BEAR_TREND": return "Bearish trend";
    case "RANGE": return "Range-bound";
    case "HIGH_VOLATILITY": return "High volatility";
    case "LOW_VOLATILITY": return "Low volatility";
    case "TRANSITION": return "Transition / mixed";
  }
}

/* ---------------- Adapters from existing engine outputs ---------------- */

/**
 * Build a canonical astro signal from `AstroData` (already computed by the
 * production engine). We only READ counts, we never recompute anything.
 */
export function astroSignal(inp: {
  bullCount: number;
  bearCount: number;
  retroCount: number;
  emaBias: "Bullish" | "Bearish" | null;
}): ModuleSignal {
  const total = Math.max(1, inp.bullCount + inp.bearCount);
  const raw = (inp.bullCount - inp.bearCount) / total;
  const emaAdj = inp.emaBias === "Bullish" ? 0.1 : inp.emaBias === "Bearish" ? -0.1 : 0;
  const score = clamp(raw + emaAdj, -1, 1);
  const bias = biasFromScore(score);
  const conf = clamp(0.5 + Math.abs(raw) * 0.5, 0.4, 1);
  return {
    key: "astro",
    label: "Astro",
    bias,
    score,
    confidence: conf,
    weight: 0.25,
    present: true,
    note: `${inp.bullCount} bullish / ${inp.bearCount} bearish planets` +
      (inp.retroCount ? `, ${inp.retroCount} retrograde` : "") +
      (inp.emaBias ? `, EMA ${inp.emaBias.toLowerCase()}` : ""),
  };
}

export function optionsSignal(inp: {
  pcrOi: number | null;
  writingBiasBull: boolean;
  writingBiasBear: boolean;
  present: boolean;
  note?: string;
}): ModuleSignal {
  if (!inp.present || inp.pcrOi == null) {
    return absent("options", 0.2);
  }
  // Put writing (bull) vs call writing (bear) is the dominant driver.
  let score = 0;
  if (inp.writingBiasBull) score += 0.5;
  if (inp.writingBiasBear) score -= 0.5;
  // PCR-OI: >1.1 bullish, <0.85 bearish (matches existing thresholds).
  if (inp.pcrOi >= 1.1) score += 0.3;
  else if (inp.pcrOi <= 0.85) score -= 0.3;
  score = clamp(score, -1, 1);
  return {
    key: "options",
    label: "Options",
    bias: biasFromScore(score),
    score,
    confidence: 0.8,
    weight: 0.2,
    present: true,
    note: inp.note ?? `PCR-OI ${inp.pcrOi.toFixed(2)}`,
  };
}

export function pcrSignal(inp: { pcrOi: number | null }): ModuleSignal {
  if (inp.pcrOi == null) return absent("pcr", 0.1);
  let score = 0;
  if (inp.pcrOi >= 1.2) score = 0.6;
  else if (inp.pcrOi >= 1.05) score = 0.3;
  else if (inp.pcrOi <= 0.8) score = -0.6;
  else if (inp.pcrOi <= 0.95) score = -0.3;
  return {
    key: "pcr",
    label: "PCR",
    bias: biasFromScore(score),
    score,
    confidence: 0.7,
    weight: 0.1,
    present: true,
    note: `PCR-OI ${inp.pcrOi.toFixed(2)}`,
  };
}

export function breadthSignal(inp: {
  advancers: number;
  decliners: number;
  present: boolean;
}): ModuleSignal {
  if (!inp.present || inp.advancers + inp.decliners <= 0)
    return absent("breadth", 0.15);
  const total = inp.advancers + inp.decliners;
  const score = clamp((inp.advancers - inp.decliners) / total, -1, 1);
  return {
    key: "breadth",
    label: "Market Breadth",
    bias: biasFromScore(score),
    score,
    confidence: 0.7,
    weight: 0.15,
    present: true,
    note: `${inp.advancers} advancing / ${inp.decliners} declining`,
  };
}

export function sectorSignal(inp: {
  leadingBias: Bias;
  strength: number; // 0..1
  note?: string;
  present: boolean;
}): ModuleSignal {
  if (!inp.present) return absent("sector", 0.1);
  const sign = biasSign(inp.leadingBias);
  const score = clamp(sign * inp.strength, -1, 1);
  return {
    key: "sector",
    label: "Sector Rotation",
    bias: inp.leadingBias,
    score,
    confidence: 0.6,
    weight: 0.1,
    present: true,
    note: inp.note ?? "Leading sector bias",
  };
}

export function vixSignal(inp: { vix: number | null; changePct: number | null }): ModuleSignal {
  if (inp.vix == null) return absent("vix", 0.1);
  // Rising VIX is contra-bullish; falling VIX confirms trend continuation.
  const change = inp.changePct ?? 0;
  let score = 0;
  if (inp.vix < 13) score += 0.3;
  else if (inp.vix > 20) score -= 0.4;
  if (change > 5) score -= 0.3;
  else if (change < -5) score += 0.2;
  score = clamp(score, -1, 1);
  return {
    key: "vix",
    label: "VIX",
    bias: biasFromScore(score),
    score,
    confidence: 0.5,
    weight: 0.1,
    present: true,
    note: `VIX ${inp.vix.toFixed(2)}${change ? ` (${change > 0 ? "+" : ""}${change.toFixed(1)}%)` : ""}`,
  };
}

export function historicalSignal(inp: {
  winRatePct: number | null;
  direction: Bias;
  sampleSize: number;
}): ModuleSignal {
  if (inp.winRatePct == null || inp.sampleSize <= 0)
    return absent("historical", 0.1);
  const edge = (inp.winRatePct - 50) / 50; // -1..+1
  const score = clamp(biasSign(inp.direction) * Math.abs(edge), -1, 1);
  const conf = clamp(0.3 + Math.min(1, inp.sampleSize / 100) * 0.7, 0.3, 1);
  return {
    key: "historical",
    label: "Historical Accuracy",
    bias: score === 0 ? "NEUTRAL" : biasFromScore(score),
    score,
    confidence: conf,
    weight: 0.1,
    present: true,
    note: `${inp.winRatePct.toFixed(1)}% win rate over ${inp.sampleSize} signals`,
  };
}

export function replaySignal(inp: {
  agreesWithDirection: boolean | null;
  direction: Bias;
  note?: string;
}): ModuleSignal {
  if (inp.agreesWithDirection == null) return absent("replay", 0.05);
  const dir = biasSign(inp.direction);
  const score = clamp(dir * (inp.agreesWithDirection ? 0.6 : -0.4), -1, 1);
  return {
    key: "replay",
    label: "Replay",
    bias: biasFromScore(score),
    score,
    confidence: 0.5,
    weight: 0.05,
    present: true,
    note: inp.note ?? (inp.agreesWithDirection ? "Replay confirms" : "Replay disagrees"),
  };
}

function absent(key: ModuleKey, weight: number): ModuleSignal {
  return {
    key,
    label: labelFor(key),
    bias: "NEUTRAL",
    score: 0,
    confidence: 0,
    weight,
    present: false,
    note: "Not available",
  };
}