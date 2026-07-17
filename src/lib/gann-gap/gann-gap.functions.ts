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

    // Confirmations are wired in Phase 2I-C. For 2I-B we emit a single
    // neutral entry so the UI can render a proper section deterministically.
    const confirmations: readonly GannGapConfirmation[] = [
      {
        id: "confirmations-pending",
        label: "Decision Engine confirmations",
        alignment: "UNAVAILABLE",
        detail:
          "Confirmations wiring lands in Phase 2I-C; classifier output is standalone.",
      },
    ];

    const bias =
      cls.label === "GAP_UP_RESEARCH"
        ? "SUPPORTS_UP"
        : cls.label === "GAP_DOWN_RESEARCH"
          ? "SUPPORTS_DOWN"
          : null;
    const confidence = bias ? deriveConfidence(confirmations, bias) : null;

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
      source: "LIVE",
      observedAt: nowIso,
      reasons: [...cls.reasons, life.reason],
      featureEnabled: true,
    };
  });