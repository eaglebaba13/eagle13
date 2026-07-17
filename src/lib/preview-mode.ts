// Phase 28 — Subscription preview navigation filter.
//
// Pure category → visibility mapping. Admin items remain role-gated by
// the existing `passesContext` logic in `navigation.ts`; this module
// only hides developer / diagnostics / experimental entries when the
// subscription preview flag is on.

import { NAV_REGISTRY, type NavItem, type NavContext, resolveNavigationForContext } from "./navigation";

export type PreviewCategory = "core" | "dev" | "experimental" | "admin";

/** Explicit deny-list of nav ids hidden in subscription-preview mode. */
const DEV_NAV_IDS = new Set<string>([
  // dev / diagnostics / experimental
  "diagnostics",
  "dev-diagnostics",
  "astro-audit",
  "astro-fixture-capture",
  "staging-validation",
]);

/** Nav ids that MUST remain visible in preview mode. */
const CORE_PREVIEW_IDS = new Set<string>([
  "dashboard",
  "astro-levels",
  "live-terminal",
  "live-market-terminal",
  "combined-pcr",
  "market-breadth",
  "options-chain",
  "options-analytics",
  "decision",
  "backtest",
  "signal-accuracy",
  "market-replay",
  "option-strategy",
  "profile",
  "license",
  "billing",
  "pricing",
  "settings",
]);

export function categoriseNavItem(id: string): PreviewCategory {
  if (id.startsWith("admin")) return "admin";
  if (DEV_NAV_IDS.has(id)) return "dev";
  if (id.startsWith("dev-") || id.includes("audit") || id.includes("staging")) return "experimental";
  return "core";
}

export interface PreviewFilterOptions {
  readonly previewMode: boolean;
  readonly navContext?: NavContext;
}

export function resolvePreviewNav(opts: PreviewFilterOptions): NavItem[] {
  const base = resolveNavigationForContext(opts.navContext ?? {});
  if (!opts.previewMode) return base;
  return base.filter((it) => {
    const cat = categoriseNavItem(it.id);
    if (cat === "admin") return true; // role-gated already
    if (cat === "core") return true;
    return false;
  });
}

/** Used by tests to guarantee coverage of core preview links. */
export function corePreviewNavIds(): readonly string[] {
  return NAV_REGISTRY.map((n) => n.id).filter((id) => CORE_PREVIEW_IDS.has(id));
}