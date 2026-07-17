// Phase 3C — Deterministic event generation from canonical context transitions.
// Pure. No I/O. No formula math. No trade execution.

import { computeFingerprint } from "./fingerprint";
import { sanitizeAlertText } from "./guardrails";
import { clampCriticalForType } from "./priority";
import { DEFAULT_RULE_CONFIG, type AlertRuleConfig } from "./rules";
import {
  ALERT_DISCLAIMER,
  SMART_ALERTS_RULES_VERSION,
  type AlertCategory,
  type AlertEvent,
  type AlertEvaluationContext,
  type AlertEvidenceItem,
  type AlertFreshness,
  type AlertPriority,
  type AlertSourceModule,
  type AlertType,
  type CanonicalVixRegime,
  type GannGapView,
  type AstroWindowView,
} from "./types";

interface BuildEventInput {
  readonly userId: string;
  readonly tradingDate: string;
  readonly nowIso: string;
  readonly type: AlertType;
  readonly category: AlertCategory;
  readonly priority: AlertPriority;
  readonly title: string;
  readonly summary: string;
  readonly instrument?: string | null;
  readonly previousState?: string | null;
  readonly currentState?: string | null;
  readonly evidence: readonly AlertEvidenceItem[];
  readonly sourceModules: readonly AlertSourceModule[];
  readonly freshness: AlertFreshness;
  readonly relevantLevel?: number | string | null;
  readonly canonicalEntity?: string | null;
  readonly expiresAt?: string | null;
  readonly formulaVersion?: string | null;
  readonly configVersion?: string | null;
}

function buildEvent(input: BuildEventInput): AlertEvent {
  const title = sanitizeAlertText(input.title).text;
  const summary = sanitizeAlertText(input.summary).text;
  const priority = clampCriticalForType(input.type, input.priority);
  const fingerprint = computeFingerprint({
    userId: input.userId,
    type: input.type,
    instrument: input.instrument ?? null,
    canonicalEntity: input.canonicalEntity ?? null,
    previousState: input.previousState ?? null,
    currentState: input.currentState ?? null,
    relevantLevel: input.relevantLevel ?? null,
    expiry: input.expiresAt ?? null,
    tradingDate: input.tradingDate,
    formulaVersion: input.formulaVersion ?? null,
    configVersion: input.configVersion ?? SMART_ALERTS_RULES_VERSION,
  });
  return {
    id: fingerprint,
    fingerprint,
    type: input.type,
    category: input.category,
    priority,
    title,
    summary,
    instrument: input.instrument ?? null,
    previousState: input.previousState ?? null,
    currentState: input.currentState ?? null,
    evidence: input.evidence,
    sourceModules: input.sourceModules,
    freshness: input.freshness,
    createdAt: input.nowIso,
    tradingDate: input.tradingDate,
    expiresAt: input.expiresAt ?? null,
    researchOnly: input.category !== "SYSTEM_HEALTH",
    disclaimer: ALERT_DISCLAIMER,
    rulesVersion: SMART_ALERTS_RULES_VERSION,
    deliveryStatus: [],
  };
}

function directionalTransition(prev: string | undefined, cur: string): "REVERSAL" | "TILT" | "NONE" {
  if (!prev || prev === cur) return "NONE";
  if (
    (prev === "BULLISH" && cur === "BEARISH") ||
    (prev === "BEARISH" && cur === "BULLISH")
  )
    return "REVERSAL";
  if (prev === "NEUTRAL" && (cur === "BULLISH" || cur === "BEARISH")) return "TILT";
  if (cur === "NEUTRAL" && (prev === "BULLISH" || prev === "BEARISH")) return "TILT";
  return "TILT";
}

export function generateEvents(
  ctx: AlertEvaluationContext,
  previous: AlertEvaluationContext["decision"] extends never ? never : NonNullable<Record<string, unknown>>,
  cfg: AlertRuleConfig = DEFAULT_RULE_CONFIG,
): AlertEvent[] {
  void previous;
  void cfg;
  return [];
}

// The real generator: takes the prior canonical snapshot from the checkpoint.
export interface PriorSnapshot {
  readonly decisionBias?: string;
  readonly pcrDirection?: string | null;
  readonly gtiState?: string | null;
  readonly breadthState?: string | null;
  readonly vixRegime?: CanonicalVixRegime;
  readonly astroState?: AstroWindowView["state"];
  readonly gapLifecycle?: GannGapView["lifecycle"];
  readonly gapPredictionId?: string | null;
  readonly strategyId?: string | null;
  readonly aiBias?: string;
  readonly moduleStatuses?: Readonly<Record<string, "HEALTHY" | "DEGRADED" | "UNAVAILABLE">>;
  readonly moduleFreshness?: Readonly<Record<string, AlertFreshness>>;
}

export function generateAlertEvents(
  ctx: AlertEvaluationContext,
  prior: PriorSnapshot,
  cfg: AlertRuleConfig = DEFAULT_RULE_CONFIG,
): AlertEvent[] {
  const out: AlertEvent[] = [];
  const base = {
    userId: ctx.userId,
    tradingDate: ctx.tradingDate,
    nowIso: ctx.generatedAt,
  };

  // ── DECISION_CHANGED ────────────────────────────────────────
  if (ctx.decision.available && ctx.decision.bias !== "UNAVAILABLE") {
    const cur = ctx.decision.bias;
    const prev = prior.decisionBias;
    const trans = directionalTransition(prev, cur);
    if (trans !== "NONE" && prev) {
      const priority: AlertPriority = trans === "REVERSAL" ? "HIGH" : "MEDIUM";
      out.push(
        buildEvent({
          ...base,
          type: "DECISION_CHANGED",
          category: "MARKET_SIGNAL",
          priority,
          title: `Decision Engine ${prev} → ${cur}`,
          summary: `Decision Engine bias changed from ${prev} to ${cur}. Action: ${ctx.decision.action ?? "n/a"}.`,
          previousState: prev,
          currentState: cur,
          evidence: [
            {
              module: "DECISION_ENGINE",
              previous: prev,
              current: cur,
              freshness: ctx.decision.freshness,
              available: ctx.decision.available,
            },
          ],
          sourceModules: ["DECISION_ENGINE"],
          freshness: ctx.decision.freshness,
        }),
      );
    }
  }

  // ── GTI_DIRECTION_CHANGED ───────────────────────────────────
  if (ctx.gti.available && ctx.gti.bias !== "UNAVAILABLE") {
    const cur = ctx.gti.bias;
    const prev = prior.gtiState;
    const prevNorm = normaliseBias(prev);
    if (prevNorm && prevNorm !== cur) {
      out.push(
        buildEvent({
          ...base,
          type: "GTI_DIRECTION_CHANGED",
          category: "MARKET_SIGNAL",
          priority: "MEDIUM",
          title: `GTI ${prevNorm} → ${cur}`,
          summary: `GTI directional read shifted from ${prevNorm} to ${cur} (state: ${ctx.gti.state ?? "n/a"}).`,
          previousState: prevNorm,
          currentState: cur,
          evidence: [
            {
              module: "GTI",
              previous: prevNorm,
              current: cur,
              freshness: ctx.gti.freshness,
              available: true,
            },
          ],
          sourceModules: ["GTI"],
          freshness: ctx.gti.freshness,
        }),
      );
    }
  }

  // ── PCR_REGIME_CHANGED ──────────────────────────────────────
  if (ctx.pcr.available && ctx.pcr.direction && ctx.pcr.direction !== prior.pcrDirection) {
    if (prior.pcrDirection) {
      out.push(
        buildEvent({
          ...base,
          type: "PCR_REGIME_CHANGED",
          category: "MARKET_SIGNAL",
          priority: "MEDIUM",
          title: `PCR regime ${prior.pcrDirection} → ${ctx.pcr.direction}`,
          summary: `Combined PCR direction changed from ${prior.pcrDirection} to ${ctx.pcr.direction}.`,
          previousState: prior.pcrDirection,
          currentState: ctx.pcr.direction,
          evidence: [
            {
              module: "COMBINED_PCR",
              previous: prior.pcrDirection,
              current: ctx.pcr.direction,
              freshness: ctx.pcr.freshness,
              available: true,
            },
          ],
          sourceModules: ["COMBINED_PCR"],
          freshness: ctx.pcr.freshness,
        }),
      );
    }
  }

  // ── BREADTH_REVERSAL ────────────────────────────────────────
  if (ctx.breadth.available && ctx.breadth.bias !== "UNAVAILABLE") {
    const prev = normaliseBias(prior.breadthState);
    const cur = ctx.breadth.bias;
    if (prev && directionalTransition(prev, cur) === "REVERSAL") {
      out.push(
        buildEvent({
          ...base,
          type: "BREADTH_REVERSAL",
          category: "MARKET_SIGNAL",
          priority: "MEDIUM",
          title: `Breadth reversal ${prev} → ${cur}`,
          summary: `Market breadth flipped from ${prev} to ${cur}.`,
          previousState: prev,
          currentState: cur,
          evidence: [
            {
              module: "MARKET_BREADTH",
              previous: prev,
              current: cur,
              freshness: ctx.breadth.freshness,
              available: true,
            },
          ],
          sourceModules: ["MARKET_BREADTH"],
          freshness: ctx.breadth.freshness,
        }),
      );
    }
  }

  // ── VIX_REGIME_CHANGED ──────────────────────────────────────
  if (ctx.vix.available && ctx.vix.regime !== "UNKNOWN") {
    if (prior.vixRegime && prior.vixRegime !== ctx.vix.regime && prior.vixRegime !== "UNKNOWN") {
      out.push(
        buildEvent({
          ...base,
          type: "VIX_REGIME_CHANGED",
          category: "MARKET_SIGNAL",
          priority: ctx.vix.regime === "HIGH" ? "HIGH" : "MEDIUM",
          title: `VIX regime ${prior.vixRegime} → ${ctx.vix.regime}`,
          summary: `India VIX regime moved from ${prior.vixRegime} to ${ctx.vix.regime} (VIX ${ctx.vix.value ?? "-"}).`,
          previousState: prior.vixRegime,
          currentState: ctx.vix.regime,
          evidence: [
            {
              module: "INDIA_VIX",
              previous: prior.vixRegime,
              current: ctx.vix.regime,
              freshness: ctx.vix.freshness,
              available: true,
            },
          ],
          sourceModules: ["INDIA_VIX"],
          freshness: ctx.vix.freshness,
        }),
      );
    }
  }

  // ── GANN_LEVEL_APPROACHING & TOUCHED ────────────────────────
  for (const lvl of ctx.gannLevels) {
    if (!lvl.available || lvl.distancePoints == null || !lvl.closestLabel) continue;
    if (lvl.touched || Math.abs(lvl.distancePoints) <= cfg.gannTouchTolerancePoints) {
      out.push(
        buildEvent({
          ...base,
          type: "GANN_LEVEL_TOUCHED",
          category: "MARKET_SIGNAL",
          priority: "HIGH",
          title: `Gann level touched: ${lvl.closestLabel}`,
          summary: `${lvl.instrument} touched Gann level ${lvl.closestLabel} (${lvl.distancePoints} pts).`,
          instrument: lvl.instrument,
          canonicalEntity: `GANN:${lvl.instrument}`,
          currentState: `TOUCHED:${lvl.closestLabel}`,
          relevantLevel: lvl.closestLabel,
          evidence: [
            {
              module: "GANN",
              previous: null,
              current: `${lvl.closestLabel} (${lvl.distancePoints} pts)`,
              freshness: lvl.freshness,
              available: true,
            },
          ],
          sourceModules: ["GANN"],
          freshness: lvl.freshness,
        }),
      );
    } else if (Math.abs(lvl.distancePoints) <= cfg.gannApproachPoints) {
      out.push(
        buildEvent({
          ...base,
          type: "GANN_LEVEL_APPROACHING",
          category: "MARKET_SIGNAL",
          priority: "LOW",
          title: `Gann level approaching: ${lvl.closestLabel}`,
          summary: `${lvl.instrument} within ${lvl.distancePoints} pts of Gann level ${lvl.closestLabel}.`,
          instrument: lvl.instrument,
          canonicalEntity: `GANN:${lvl.instrument}`,
          currentState: `APPROACHING:${lvl.closestLabel}`,
          relevantLevel: lvl.closestLabel,
          evidence: [
            {
              module: "GANN",
              previous: null,
              current: `${lvl.closestLabel} (${lvl.distancePoints} pts)`,
              freshness: lvl.freshness,
              available: true,
            },
          ],
          sourceModules: ["GANN"],
          freshness: lvl.freshness,
        }),
      );
    }
  }

  // ── ASTRO_WINDOW_STARTING & ACTIVE ──────────────────────────
  if (ctx.astro.available && ctx.astro.state !== "NONE") {
    const prev = prior.astroState;
    if (
      ctx.astro.state === "UPCOMING" &&
      ctx.astro.startsInMinutes != null &&
      ctx.astro.startsInMinutes <= cfg.astroLeadMinutes &&
      prev !== "UPCOMING"
    ) {
      out.push(
        buildEvent({
          ...base,
          type: "ASTRO_WINDOW_STARTING",
          category: "RESEARCH",
          priority: "LOW",
          title: `Astro window starting soon${ctx.astro.label ? `: ${ctx.astro.label}` : ""}`,
          summary: `Astro window ${ctx.astro.label ?? ""} starts in ${ctx.astro.startsInMinutes} minutes.`,
          previousState: prev ?? null,
          currentState: "UPCOMING",
          evidence: [
            {
              module: "ASTRO",
              previous: prev ?? null,
              current: "UPCOMING",
              freshness: ctx.astro.freshness,
              available: true,
              note: ctx.astro.label ?? undefined,
            },
          ],
          sourceModules: ["ASTRO"],
          freshness: ctx.astro.freshness,
        }),
      );
    }
    if (ctx.astro.state === "ACTIVE" && prev !== "ACTIVE") {
      out.push(
        buildEvent({
          ...base,
          type: "ASTRO_WINDOW_ACTIVE",
          category: "RESEARCH",
          priority: "MEDIUM",
          title: `Astro window active${ctx.astro.label ? `: ${ctx.astro.label}` : ""}`,
          summary: `Astro window ${ctx.astro.label ?? ""} is now active.`,
          previousState: prev ?? null,
          currentState: "ACTIVE",
          evidence: [
            {
              module: "ASTRO",
              previous: prev ?? null,
              current: "ACTIVE",
              freshness: ctx.astro.freshness,
              available: true,
              note: ctx.astro.label ?? undefined,
            },
          ],
          sourceModules: ["ASTRO"],
          freshness: ctx.astro.freshness,
        }),
      );
    }
  }

  // ── GANN_GAP_PREDICTION_FROZEN ──────────────────────────────
  if (
    ctx.gannGap.available &&
    ctx.gannGap.lifecycle === "FROZEN" &&
    prior.gapLifecycle !== "FROZEN" &&
    ctx.gannGap.predictionId
  ) {
    out.push(
      buildEvent({
        ...base,
        type: "GANN_GAP_PREDICTION_FROZEN",
        category: "RESEARCH",
        priority: "MEDIUM",
        title: `Gann Gap prediction frozen${ctx.gannGap.label ? `: ${ctx.gannGap.label}` : ""}`,
        summary: `Gann Gap outlook has been frozen for the next session.`,
        canonicalEntity: `GAP:${ctx.gannGap.predictionId}`,
        previousState: prior.gapLifecycle ?? null,
        currentState: "FROZEN",
        evidence: [
          {
            module: "GANN_GAP_OUTLOOK",
            previous: prior.gapLifecycle ?? null,
            current: "FROZEN",
            freshness: ctx.gannGap.freshness,
            available: true,
            note: ctx.gannGap.label ?? undefined,
          },
        ],
        sourceModules: ["GANN_GAP_OUTLOOK"],
        freshness: ctx.gannGap.freshness,
      }),
    );
  }

  // ── GANN_GAP_OUTCOME_AVAILABLE ──────────────────────────────
  if (
    ctx.gannGap.available &&
    ctx.gannGap.lifecycle === "OUTCOME" &&
    prior.gapLifecycle !== "OUTCOME" &&
    ctx.gannGap.predictionId
  ) {
    out.push(
      buildEvent({
        ...base,
        type: "GANN_GAP_OUTCOME_AVAILABLE",
        category: "RESEARCH",
        priority: "LOW",
        title: `Gann Gap outcome available`,
        summary: `An outcome has been recorded for the latest Gann Gap prediction.`,
        canonicalEntity: `GAP:${ctx.gannGap.predictionId}`,
        previousState: prior.gapLifecycle ?? null,
        currentState: "OUTCOME",
        evidence: [
          {
            module: "GANN_GAP_OUTLOOK",
            previous: prior.gapLifecycle ?? null,
            current: "OUTCOME",
            freshness: ctx.gannGap.freshness,
            available: true,
          },
        ],
        sourceModules: ["GANN_GAP_OUTLOOK"],
        freshness: ctx.gannGap.freshness,
      }),
    );
  }

  // ── OPTION_STRATEGY_CHANGED ─────────────────────────────────
  if (
    ctx.strategy.available &&
    ctx.strategy.topStrategyId &&
    prior.strategyId &&
    ctx.strategy.topStrategyId !== prior.strategyId
  ) {
    out.push(
      buildEvent({
        ...base,
        type: "OPTION_STRATEGY_CHANGED",
        category: "RESEARCH",
        priority: "LOW",
        title: `Option strategy recommendation changed`,
        summary: `Preferred option strategy changed from ${prior.strategyId} to ${ctx.strategy.topStrategyId}.`,
        previousState: prior.strategyId,
        currentState: ctx.strategy.topStrategyId,
        evidence: [
          {
            module: "OPTION_STRATEGY_TERMINAL",
            previous: prior.strategyId,
            current: ctx.strategy.topStrategyId,
            freshness: ctx.strategy.freshness,
            available: true,
          },
        ],
        sourceModules: ["OPTION_STRATEGY_TERMINAL"],
        freshness: ctx.strategy.freshness,
      }),
    );
  }

  // ── AI_MARKET_BIAS_CHANGED ──────────────────────────────────
  if (ctx.ai.available && ctx.ai.bias !== "UNAVAILABLE") {
    const prev = prior.aiBias;
    if (prev && prev !== ctx.ai.bias) {
      out.push(
        buildEvent({
          ...base,
          type: "AI_MARKET_BIAS_CHANGED",
          category: "RESEARCH",
          priority: "MEDIUM",
          title: `AI Market Assistant bias ${prev} → ${ctx.ai.bias}`,
          summary: `AI Market Assistant bias changed from ${prev} to ${ctx.ai.bias} (confidence ${ctx.ai.confidence ?? "n/a"}).`,
          previousState: prev,
          currentState: ctx.ai.bias,
          evidence: [
            {
              module: "AI_MARKET_ASSISTANT",
              previous: prev,
              current: ctx.ai.bias,
              freshness: ctx.ai.freshness,
              available: true,
            },
          ],
          sourceModules: ["AI_MARKET_ASSISTANT"],
          freshness: ctx.ai.freshness,
        }),
      );
    }
  }

  // ── RUNTIME_MODULE_DEGRADED & RECOVERED ─────────────────────
  if (ctx.runtime.available) {
    for (const m of ctx.runtime.modules) {
      const prev = prior.moduleStatuses?.[m.module];
      if (prev && prev !== m.status) {
        if (m.status === "DEGRADED" || m.status === "UNAVAILABLE") {
          out.push(
            buildEvent({
              ...base,
              type: "RUNTIME_MODULE_DEGRADED",
              category: "SYSTEM_HEALTH",
              priority: m.status === "UNAVAILABLE" ? "CRITICAL" : "HIGH",
              title: `Module degraded: ${m.module}`,
              summary: `Runtime module ${m.module} is ${m.status}. ${m.reason ?? ""}`.trim(),
              canonicalEntity: `RUNTIME:${m.module}`,
              previousState: prev,
              currentState: m.status,
              evidence: [
                {
                  module: m.module,
                  previous: prev,
                  current: m.status,
                  freshness: "UNKNOWN",
                  available: false,
                  note: m.reason ?? undefined,
                },
              ],
              sourceModules: ["RUNTIME_READINESS", m.module],
              freshness: "UNKNOWN",
            }),
          );
        } else if (prev !== "HEALTHY" && m.status === "HEALTHY") {
          out.push(
            buildEvent({
              ...base,
              type: "RUNTIME_MODULE_RECOVERED",
              category: "SYSTEM_HEALTH",
              priority: "INFO",
              title: `Module recovered: ${m.module}`,
              summary: `Runtime module ${m.module} recovered to HEALTHY.`,
              canonicalEntity: `RUNTIME:${m.module}`,
              previousState: prev,
              currentState: m.status,
              evidence: [
                {
                  module: m.module,
                  previous: prev,
                  current: m.status,
                  freshness: "UNKNOWN",
                  available: true,
                },
              ],
              sourceModules: ["RUNTIME_READINESS", m.module],
              freshness: "UNKNOWN",
            }),
          );
        }
      }
    }
  }

  // ── DATA_STALE & RECOVERED ──────────────────────────────────
  const freshnessMap: Record<string, AlertFreshness> = {
    DECISION_ENGINE: ctx.decision.freshness,
    COMBINED_PCR: ctx.pcr.freshness,
    GTI: ctx.gti.freshness,
    MARKET_BREADTH: ctx.breadth.freshness,
    INDIA_VIX: ctx.vix.freshness,
  };
  for (const [module, cur] of Object.entries(freshnessMap)) {
    const prev = prior.moduleFreshness?.[module];
    if (!prev) continue;
    if (prev !== "STALE" && cur === "STALE") {
      out.push(
        buildEvent({
          ...base,
          type: "DATA_STALE",
          category: "SYSTEM_HEALTH",
          priority: "HIGH",
          title: `Data stale: ${module}`,
          summary: `${module} data has become STALE.`,
          canonicalEntity: `FRESH:${module}`,
          previousState: prev,
          currentState: cur,
          evidence: [
            { module: module as AlertSourceModule, previous: prev, current: cur, freshness: cur, available: false },
          ],
          sourceModules: [module as AlertSourceModule],
          freshness: cur,
        }),
      );
    } else if (prev === "STALE" && cur !== "STALE" && cur !== "UNKNOWN") {
      out.push(
        buildEvent({
          ...base,
          type: "DATA_RECOVERED",
          category: "SYSTEM_HEALTH",
          priority: "INFO",
          title: `Data recovered: ${module}`,
          summary: `${module} data freshness recovered to ${cur}.`,
          canonicalEntity: `FRESH:${module}`,
          previousState: prev,
          currentState: cur,
          evidence: [
            { module: module as AlertSourceModule, previous: prev, current: cur, freshness: cur, available: true },
          ],
          sourceModules: [module as AlertSourceModule],
          freshness: cur,
        }),
      );
    }
  }

  return out;
}

function normaliseBias(state: string | null | undefined): string | null {
  if (!state) return null;
  const s = state.toUpperCase();
  if (s.includes("BULL")) return "BULLISH";
  if (s.includes("BEAR")) return "BEARISH";
  if (s.includes("NEUTRAL") || s.includes("RANGE")) return "NEUTRAL";
  return null;
}