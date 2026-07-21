// Phase 44C — Diff-based Telegram alert trigger rules.
// Emits only on meaningful state changes; never spams unchanged data.
import type { InstitutionalBias, MacroRisk, NewsItem } from "./types";

export interface AlertPrevState {
  readonly institutionalBias?: InstitutionalBias | null;
  readonly macroRisk?: MacroRisk | null;
  readonly seenNewsKeys?: readonly string[];
}

export interface AlertCurrState {
  readonly institutionalBias?: InstitutionalBias | null;
  readonly macroRisk?: MacroRisk | null;
  readonly highImpactNews?: readonly NewsItem[];
}

export interface Alert {
  readonly kind: "BIAS_CHANGE" | "MACRO_CHANGE" | "HIGH_IMPACT_NEWS";
  readonly message: string;
  readonly key: string;
}

export function newsKey(n: NewsItem): string {
  return `${n.source}::${n.headline}`.slice(0, 200);
}

export function diffAlerts(prev: AlertPrevState, curr: AlertCurrState): Alert[] {
  const alerts: Alert[] = [];
  if (curr.institutionalBias && prev.institutionalBias && curr.institutionalBias !== prev.institutionalBias) {
    alerts.push({
      kind: "BIAS_CHANGE",
      message: `Institutional bias ${prev.institutionalBias} to ${curr.institutionalBias}`,
      key: `bias:${curr.institutionalBias}`,
    });
  }
  if (curr.macroRisk && prev.macroRisk && curr.macroRisk !== prev.macroRisk) {
    alerts.push({
      kind: "MACRO_CHANGE",
      message: `Macro risk ${prev.macroRisk} to ${curr.macroRisk}`,
      key: `macro:${curr.macroRisk}`,
    });
  }
  const seen = new Set(prev.seenNewsKeys ?? []);
  for (const n of curr.highImpactNews ?? []) {
    const k = newsKey(n);
    if (seen.has(k)) continue;
    alerts.push({
      kind: "HIGH_IMPACT_NEWS",
      message: `[${n.impact}] ${n.headline} — ${n.source}`,
      key: `news:${k}`,
    });
  }
  return alerts;
}