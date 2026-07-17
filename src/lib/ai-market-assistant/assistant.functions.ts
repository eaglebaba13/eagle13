// Phase 3B — Assistant server function. Consumer-only aggregation of
// canonical snapshots. Never creates provider connections directly.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { getDecisionSnapshot } from "@/lib/decision.functions";
import { getGtiSummary } from "@/lib/gti-summary/gti-summary.functions";
import { getGannGapOutlook } from "@/lib/gann-gap/gann-gap.functions";
import { getOptionStrategyTerminal } from "@/lib/option-strategy-terminal/terminal.functions";

import type { Bias, ModuleKey } from "@/lib/decision-engine";
import type { CanonicalBias } from "@/lib/option-strategy-terminal/types";
import { buildCanonicalContext } from "./context";
import { runAssistant } from "./assistant";
import { buildDiagnostics, type AssistantDiagnostics } from "./diagnostics";
import type { AssistantResponse } from "./types";

function biasToCanonical(bias: Bias | undefined, present: boolean): CanonicalBias {
  if (!present) return "UNAVAILABLE";
  if (bias === "BULL") return "BULLISH";
  if (bias === "BEAR") return "BEARISH";
  if (bias === "NEUTRAL") return "NEUTRAL";
  return "UNAVAILABLE";
}

function gtiStateToBias(state: string | undefined): CanonicalBias {
  const s = (state ?? "").toUpperCase();
  if (s.includes("BULL")) return "BULLISH";
  if (s.includes("BEAR")) return "BEARISH";
  if (s.includes("CONFLICT")) return "CONFLICT";
  if (s.includes("NEUTRAL") || s.includes("RANGE") || s.includes("NO_TRADE")) return "NEUTRAL";
  return "UNAVAILABLE";
}

function gapLabelToBias(label: string | undefined): CanonicalBias {
  const s = (label ?? "").toUpperCase();
  if (s.includes("UP") || s.includes("BULL")) return "BULLISH";
  if (s.includes("DOWN") || s.includes("BEAR")) return "BEARISH";
  if (s.includes("FLAT") || s.includes("NEUTRAL") || s.includes("RANGE")) return "NEUTRAL";
  return "UNAVAILABLE";
}

function decisionActionToBias(action: string | undefined): CanonicalBias {
  if (!action) return "UNAVAILABLE";
  if (action === "STRONG_BUY_CE" || action === "BUY_CE") return "BULLISH";
  if (action === "STRONG_BUY_PE" || action === "BUY_PE") return "BEARISH";
  if (action === "WAIT") return "NEUTRAL";
  return "UNAVAILABLE";
}

export interface AssistantEnvelope {
  readonly response: AssistantResponse;
  readonly diagnostics: AssistantDiagnostics;
}

export const getAiMarketAssistant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AssistantEnvelope> => {
    const started = Date.now();
    const generatedAt = new Date().toISOString();
    const errors: string[] = [];

    const [decisionRes, gtiRes, gapRes, terminalRes] = await Promise.allSettled([
      getDecisionSnapshot(),
      getGtiSummary(),
      getGannGapOutlook(),
      getOptionStrategyTerminal(),
    ]);

    const decision = decisionRes.status === "fulfilled" ? decisionRes.value : null;
    if (decisionRes.status === "rejected") errors.push("decision:unavailable");
    const gti = gtiRes.status === "fulfilled" ? gtiRes.value : null;
    if (gtiRes.status === "rejected") errors.push("gti:unavailable");
    const gap = gapRes.status === "fulfilled" ? gapRes.value : null;
    if (gapRes.status === "rejected") errors.push("gap:unavailable");
    const terminal = terminalRes.status === "fulfilled" ? terminalRes.value : null;
    if (terminalRes.status === "rejected") errors.push("terminal:unavailable");

    const findContribution = (key: ModuleKey) =>
      decision?.decision.contributions.find((c) => c.key === key) ?? null;
    const astroC = findContribution("astro");
    const pcrC = findContribution("pcr");
    const breadthC = findContribution("breadth");

    const decisionSource = decision ? "LIVE" : "UNKNOWN";
    const vixValue = decision?.context.vix ?? gti?.vix.value ?? null;
    const vixRegime = (gti?.vix.regime ?? (vixValue != null ? "MID" : "UNKNOWN")).toUpperCase();

    const ctx = buildCanonicalContext({
      generatedAt,
      decision: {
        available: !!decision,
        bias: decisionActionToBias(decision?.decision.action),
        action: decision?.decision.action,
        confidence: decision?.decision.confidence ?? null,
        source: decisionSource,
      },
      pcr: {
        available: !!pcrC?.present,
        bias: biasToCanonical(pcrC?.bias, !!pcrC?.present),
        direction: decision?.capabilities.pcrCombined.direction ?? undefined,
        source: decisionSource,
      },
      gti: {
        available: !!gti,
        bias: gtiStateToBias(gti?.gti.state),
        state: gti?.gti.state,
        source: gti?.source,
      },
      breadth: {
        available: !!breadthC?.present,
        bias: biasToCanonical(breadthC?.bias, !!breadthC?.present),
        state: gti?.breadthState,
        source: gti?.source,
      },
      astro: {
        available: !!astroC?.present,
        bias: biasToCanonical(astroC?.bias, !!astroC?.present),
        source: decisionSource,
      },
      gann: { available: false, bias: "UNAVAILABLE", source: "UNKNOWN" },
      gannGap: {
        available: !!gap && gap.lifecycle !== "PENDING",
        bias: gap && gap.lifecycle !== "PENDING" ? gapLabelToBias(gap.label) : "UNAVAILABLE",
        label: gap?.label,
        source: gap?.source,
      },
      vix: {
        available: vixValue != null,
        value: vixValue,
        regime: vixRegime,
      },
      strategy: buildStrategyView(terminal),
      runtime: { overall: "UNKNOWN", degradedModules: [] },
    });

    const response = runAssistant(ctx);
    const diagnostics = buildDiagnostics(ctx, response, Date.now() - started, errors);
    return { response, diagnostics };
  });

function buildStrategyView(
  terminal: Awaited<ReturnType<typeof getOptionStrategyTerminal>> | null,
) {
  if (!terminal || terminal.engine.recommended.length === 0) {
    return {
      available: false,
      preferredCategory: "Unavailable",
      rationale: "Option Strategy Terminal recommendation is not available.",
      keyRisk: "n/a",
      requiredConfirmation: "n/a",
      invalidation: "n/a",
    };
  }
  const top = terminal.engine.recommended[0];
  const bias = top.profile.bias;
  const risk =
    top.profile.risk === "UNLIMITED"
      ? "Unlimited downside potential in this profile — position sizing critical."
      : `Risk tier: ${top.profile.risk}.`;
  const confirm =
    bias === "NEUTRAL"
      ? "Requires stable range and volatility alignment."
      : "Requires directional consensus across Decision, GTI and PCR.";
  const invalidation =
    "A material flip in Decision Engine, GTI or PCR should reset this recommendation.";
  return {
    available: true,
    preferredCategory: top.profile.label,
    rationale: top.profile.summary,
    keyRisk: risk,
    requiredConfirmation: confirm,
    invalidation,
  };
}

export type AiMarketAssistantEnvelope = AssistantEnvelope;