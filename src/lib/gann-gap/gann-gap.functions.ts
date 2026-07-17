// Phase 2I-B — Gann Gap Outlook server function.
// Consumes the canonical NIFTY market snapshot; never opens its own
// provider connection. Feature-flagged and idempotent per session.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findFeatureFlag } from "@/lib/feature-flags";
import { DEFAULT_GANN_GAP_CONFIG } from "./config";
import { GANN_GAP_CONFIG_VERSION, GANN_GAP_FORMULA_VERSION } from "./formula-version";
import { generateGannGapLevels } from "./levels";
import { computeClosingZone } from "./closing-zone";
import { classifyGannGap } from "./classifier";
import { deriveConfidence } from "./confidence";
import { resolveLifecycle } from "./session-clock";
import {
  decisionConfirmation,
  pcrConfirmation,
  gtiConfirmation,
  breadthConfirmation,
  vixConfirmation,
  astroConfirmation,
} from "./confirmations";
import type {
  GannGapConfirmation,
  GannGapOutlook,
  GannGapOutlookLabel,
} from "./types";

function emptyOutlook(
  label: GannGapOutlookLabel,
  lifecycle: GannGapOutlook["lifecycle"],
  reasons: readonly string[],
  observedAt: string,
  featureEnabled: boolean,
  tradingDate = "",
  nextTradingDate = "",
): GannGapOutlook {
  return {
    formulaVersion: GANN_GAP_FORMULA_VERSION,
    configVersion: GANN_GAP_CONFIG_VERSION,
    tradingDate,
    nextTradingDate,
    lifecycle,
    label,
    reference: null,
    levels: [],
    zone: null,
    confirmations: [],
    confidence: null,
    source: "UNAVAILABLE",
    observedAt,
    reasons,
    featureEnabled,
  };
}

export const getGannGapOutlook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<GannGapOutlook> => {
    const now = new Date();
    const nowIso = now.toISOString();
    const flag = findFeatureFlag("gann.gap.outlook");
    const featureEnabled = !!flag?.enabled;

    if (!featureEnabled) {
      return emptyOutlook(
        "DATA_UNAVAILABLE",
        "FROZEN",
        ["Feature flag gann.gap.outlook is disabled"],
        nowIso,
        false,
      );
    }

    const cfg = DEFAULT_GANN_GAP_CONFIG;
    const life = resolveLifecycle({ now, config: cfg });

    // Canonical market data — never construct a new provider client here.
    const { getMarketData } = await import("@/lib/market.functions");
    let reference: number | null = null;
    try {
      const md = await getMarketData();
      const nifty = md?.nifty;
      // Prefer previous-day close as reference; fall back to live price.
      reference = nifty?.prevDay?.close ?? nifty?.livePrice ?? null;
    } catch {
      reference = null;
    }

    if (life.lifecycle === "PENDING") {
      return {
        ...emptyOutlook(
          "PENDING",
          "PENDING",
          [life.reason],
          nowIso,
          true,
          life.istDate,
          life.nextTradingDate,
        ),
        source: reference != null ? "LIVE" : "UNAVAILABLE",
        reference,
      };
    }

    if (reference == null) {
      return emptyOutlook(
        "DATA_UNAVAILABLE",
        life.lifecycle,
        ["NIFTY reference price unavailable from canonical market snapshot"],
        nowIso,
        true,
        life.istDate,
        life.nextTradingDate,
      );
    }

    const levels = generateGannGapLevels({
      reference,
      below: cfg.levelsBelow,
      above: cfg.levelsAbove,
    });
    const zone = computeClosingZone(reference, levels, cfg);
    const cls = classifyGannGap({
      hasReference: true,
      beforeCutoff: false,
      zone,
    });

    // Bias derived from classifier — needed to align confirmations.
    const bias =
      cls.label === "GAP_UP_RESEARCH"
        ? "SUPPORTS_UP"
        : cls.label === "GAP_DOWN_RESEARCH"
          ? "SUPPORTS_DOWN"
          : "SUPPORTS_UP"; // neutral bias placeholder for aggregation only

    // ── Phase 2I-C: live confirmation wiring ────────────────────────
    // Fetch canonical modules in parallel. Each call is best-effort;
    // failures degrade the individual confirmation to UNAVAILABLE.
    const [gtiRes, decisionRes] = await Promise.allSettled([
      (async () => {
        const { getGtiSummary } = await import("@/lib/gti-summary/gti-summary.functions");
        return getGtiSummary();
      })(),
      (async () => {
        const { getDecisionSnapshot } = await import("@/lib/decision.functions");
        return getDecisionSnapshot();
      })(),
    ]);
    const gti = gtiRes.status === "fulfilled" ? gtiRes.value : null;
    const decision = decisionRes.status === "fulfilled" ? decisionRes.value : null;

    // Decision bias from action string ("BUY_CE" → BULL, "BUY_PE" → BEAR).
    const decisionAction = decision?.summary.decision ?? "";
    const decisionBias: "BULL" | "BEAR" | "NEUTRAL" | null = decision
      ? decisionAction.includes("CE")
        ? "BULL"
        : decisionAction.includes("PE")
          ? "BEAR"
          : "NEUTRAL"
      : null;

    const confDecision = decisionConfirmation(
      {
        available: decision != null,
        bias: decisionBias,
        confidence: decision?.summary.confidence ?? null,
        source: "DECISION",
        observedAt: decision?.summary.generatedAt,
        reason: decision ? "Decision snapshot healthy" : "Decision snapshot unavailable",
      },
      bias,
    );

    const confPcr = pcrConfirmation(
      {
        available: gti != null && gti.combinedPcr.score != null,
        direction: gti?.combinedPcr.direction ?? null,
        score: gti?.combinedPcr.score ?? null,
        source: "OPTIONS",
        observedAt: gti?.generatedAt,
      },
      bias,
    );

    const confGti = gtiConfirmation(
      {
        available: gti != null,
        state: gti?.gti.state ?? null,
        confidence: gti?.gti.confidence ?? null,
        source: "BREADTH",
        observedAt: gti?.generatedAt,
      },
      bias,
    );

    // Market Breadth: GTI Summary carries a demo breadthState string. The
    // adapter needs a numeric netBreadth; without one, degrade honestly.
    const confBreadth = breadthConfirmation(
      {
        available: false,
        netBreadth: null,
        source: "BREADTH_DEMO",
        reason: "Market breadth research-demo — no live net breadth wired",
      },
      bias,
    );

    const confVix = vixConfirmation(
      {
        available: gti?.vix.value != null,
        value: gti?.vix.value ?? null,
        rising: gti?.vix.rising ?? null,
        source: "QUOTES",
        observedAt: gti?.generatedAt,
      },
      bias,
    );

    // Astro: no directional adapter exposed yet — remain UNAVAILABLE.
    const confAstro = astroConfirmation(
      {
        available: false,
        bias: null,
        source: "ASTRO",
        reason: "Astro directional adapter not wired",
      },
      bias,
    );

    const confirmations: readonly GannGapConfirmation[] = [
      confDecision,
      confPcr,
      confGti,
      confBreadth,
      confVix,
      confAstro,
    ];

    const alignedBias =
      cls.label === "GAP_UP_RESEARCH" || cls.label === "GAP_DOWN_RESEARCH" ? bias : null;
    const confidence = alignedBias ? deriveConfidence(confirmations, alignedBias) : null;

    // Source reliability clamp: LIVE only when every confirmation is
    // available AND the GTI summary itself reports LIVE. Otherwise MIXED,
    // or RESEARCH_DEMO when the only usable input is the classifier itself.
    const anyAvailable = confirmations.some((c) => c.alignment !== "UNAVAILABLE");
    const allAvailable = confirmations.every((c) => c.alignment !== "UNAVAILABLE");
    const gtiSource = (gti?.source ?? "UNKNOWN") as string;
    const source: GannGapOutlook["source"] =
      allAvailable && gtiSource === "LIVE"
        ? "LIVE"
        : anyAvailable
          ? "MIXED"
          : reference != null
            ? "RESEARCH_DEMO"
            : "UNAVAILABLE";

    return {
      formulaVersion: GANN_GAP_FORMULA_VERSION,
      configVersion: GANN_GAP_CONFIG_VERSION,
      tradingDate: life.istDate,
      nextTradingDate: life.nextTradingDate,
      lifecycle: life.lifecycle,
      label: cls.label,
      reference,
      levels,
      zone,
      confirmations,
      confidence,
      source,
      observedAt: nowIso,
      reasons: [...cls.reasons, life.reason],
      featureEnabled: true,
    };
  });