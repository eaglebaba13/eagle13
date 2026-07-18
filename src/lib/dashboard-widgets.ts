// Phase 24B · Single dashboard-widget registry.
//
// Every card on the main dashboard has ONE entry here. Desktop and mobile
// consume the same registry — they may only differ in order and column
// span, never in the widget set.
//
// This registry is metadata only. It does not import UI, it does not fetch
// data, and it never emits trade signals. Data hooks are looked up
// separately via the `dataDependency` field.

export type WidgetSection =
  | "SUMMARY"
  | "SIGNAL"
  | "DECISION"
  | "RISK"
  | "OPTIONS"
  | "OBSERVATION"
  | "META";

export type PlanTier = "free" | "pro" | "professional" | "elite" | "admin";

export type UserRole = "user" | "pro" | "professional" | "admin";

export type Environment = "development" | "production";

export type WidgetDataDependency =
  | "MARKET_DATA"
  | "ASTRO_SNAPSHOT"
  | "DECISION_SNAPSHOT"
  | "OPTIONS_CHAIN"
  | "MARKET_BREADTH"
  | "PORTFOLIO_SUMMARY"
  | "SHADOW_STATUS"
  | "GOLD_SILVER_RATIO"
  | "NEWS_FEED"
  | "META_ONLY";

export type RefreshPolicy =
  | { kind: "interval"; intervalMs: number }
  | { kind: "on-focus" }
  | { kind: "manual" }
  | { kind: "closed-candle" }
  | { kind: "static" };

export type WidgetDefinition = {
  id: string;
  title: string;
  section: WidgetSection;
  /** Async component loader for code-splitting. Kept opaque — the renderer
   *  wraps it in React.lazy(). */
  componentLoader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>;
  minimumPlan: PlanTier;
  requiredRole?: UserRole;
  enabled: boolean;
  desktopSpan: 3 | 4 | 6 | 8 | 12; // 12-column grid
  tabletSpan: 1 | 2;
  mobileOrder: number;
  desktopOrder: number;
  /** Higher priority renders above the fold and eager-loads. */
  priority: number;
  dataDependency: WidgetDataDependency;
  refreshPolicy: RefreshPolicy;
  formulaVersion?: string;
  methodologyLabel?: string;
  supportsFreshness: boolean;
  supportsCollapse: boolean;
  /** Required widgets cannot be hidden through user preferences. */
  required?: boolean;
  environment?: Environment;
  featureFlag?: string;
};

// ---- Loaders ---------------------------------------------------------------
// We intentionally do NOT statically import route-embedded components here —
// the current dashboard route remains authoritative. Loaders below reference
// dashboard-safe components; unresolved widgets fall back to a placeholder
// so the registry can be introspected without a runtime crash.

const placeholderLoader = () =>
  Promise.resolve({
    default: (() => null) as unknown as React.ComponentType<Record<string, unknown>>,
  });

const goldSilverLoader = () =>
  import("@/components/dashboard/GoldSilverRatioCard").then((m) => ({
    default: m.GoldSilverRatioCard as unknown as React.ComponentType<Record<string, unknown>>,
  }));

// Phase 24C · Legacy dashboard adapters (context-driven, no fetching).
const legacyGoldSilverLoader = () =>
  import("@/components/dashboard/widgets/GoldSilverWidget").then((m) => ({ default: m.default }));
const legacyQuoteLoader = () =>
  import("@/components/dashboard/widgets/QuoteWidget").then((m) => ({ default: m.default }));
const legacyVixLoader = () =>
  import("@/components/dashboard/widgets/VixWidget").then((m) => ({ default: m.default }));
const legacySignalLoader = () =>
  import("@/components/dashboard/widgets/SignalWidget").then((m) => ({ default: m.default }));
const legacyGlobalMarketsLoader = () =>
  import("@/components/dashboard/widgets/GlobalMarketsWidget").then((m) => ({ default: m.default }));
const legacyCprLoader = () =>
  import("@/components/dashboard/widgets/CprWidget").then((m) => ({ default: m.default }));
const legacySafeZonesLoader = () =>
  import("@/components/dashboard/widgets/SafeZonesWidget").then((m) => ({ default: m.default }));
const legacyGannLoader = () =>
  import("@/components/dashboard/widgets/GannWidget").then((m) => ({ default: m.default }));
const legacyPivotLoader = () =>
  import("@/components/dashboard/widgets/PivotWidget").then((m) => ({ default: m.default }));
const legacyGannCycleLoader = () =>
  import("@/components/dashboard/widgets/GannCycleWidget").then((m) => ({ default: m.default }));
const legacyInstitutionalFlowLoader = () =>
  import("@/components/dashboard/widgets/InstitutionalFlowWidget").then((m) => ({ default: m.default }));

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    id: "market-summary",
    title: "Market Summary",
    section: "SUMMARY",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 10,
    desktopOrder: 10,
    priority: 100,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: false,
    required: true,
  },
  {
    id: "nifty50",
    title: "NIFTY 50",
    section: "SUMMARY",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 20,
    desktopOrder: 20,
    priority: 95,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "banknifty",
    title: "BANKNIFTY",
    section: "SUMMARY",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 30,
    desktopOrder: 30,
    priority: 95,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "india-vix",
    title: "India VIX",
    section: "SUMMARY",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 4,
    tabletSpan: 1,
    mobileOrder: 40,
    desktopOrder: 40,
    priority: 80,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "gold-silver-ratio",
    title: "Gold–Silver Ratio",
    section: "SIGNAL",
    componentLoader: goldSilverLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 4,
    tabletSpan: 1,
    mobileOrder: 50,
    desktopOrder: 50,
    priority: 90,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    formulaVersion: "GOLD_SILVER_RATIO_V1",
    methodologyLabel: "Gold–Silver Ratio v1",
    supportsFreshness: true,
    supportsCollapse: true,
    required: true,
  },
  {
    id: "astro-levels",
    title: "Astro Levels",
    section: "SIGNAL",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 8,
    tabletSpan: 2,
    mobileOrder: 60,
    desktopOrder: 60,
    priority: 90,
    dataDependency: "ASTRO_SNAPSHOT",
    refreshPolicy: { kind: "interval", intervalMs: 60_000 },
    formulaVersion: "GANN_NIFTY_ASTRO_V1_1",
    methodologyLabel: "Gann Nifty Astro v1.1",
    supportsFreshness: true,
    supportsCollapse: true,
    required: true,
  },
  {
    id: "planet-nakshatra",
    title: "Planet / Nakshatra",
    section: "SIGNAL",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 4,
    tabletSpan: 1,
    mobileOrder: 70,
    desktopOrder: 70,
    priority: 70,
    dataDependency: "ASTRO_SNAPSHOT",
    refreshPolicy: { kind: "interval", intervalMs: 60_000 },
    formulaVersion: "GANN_NIFTY_ASTRO_V1_1",
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "signal",
    title: "Signal",
    section: "SIGNAL",
    componentLoader: placeholderLoader,
    minimumPlan: "pro",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 80,
    desktopOrder: 80,
    priority: 85,
    dataDependency: "DECISION_SNAPSHOT",
    refreshPolicy: { kind: "interval", intervalMs: 60_000 },
    formulaVersion: "ASTRO_SMC_HYBRID_V1",
    methodologyLabel: "Astro+SMC Hybrid v1",
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "decision",
    title: "Decision",
    section: "DECISION",
    componentLoader: placeholderLoader,
    minimumPlan: "pro",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 90,
    desktopOrder: 90,
    priority: 85,
    dataDependency: "DECISION_SNAPSHOT",
    refreshPolicy: { kind: "interval", intervalMs: 60_000 },
    formulaVersion: "DECISION_CENTER_V1",
    methodologyLabel: "Decision Center v1",
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "risk",
    title: "Risk",
    section: "RISK",
    componentLoader: placeholderLoader,
    minimumPlan: "pro",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 100,
    desktopOrder: 100,
    priority: 60,
    dataDependency: "PORTFOLIO_SUMMARY",
    refreshPolicy: { kind: "manual" },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "market-breadth",
    title: "Market Breadth",
    section: "SUMMARY",
    componentLoader: placeholderLoader,
    minimumPlan: "pro",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 110,
    desktopOrder: 110,
    priority: 50,
    dataDependency: "MARKET_BREADTH",
    refreshPolicy: { kind: "interval", intervalMs: 60_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "options-pcr",
    title: "Options / PCR",
    section: "OPTIONS",
    componentLoader: placeholderLoader,
    minimumPlan: "pro",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 120,
    desktopOrder: 120,
    priority: 55,
    dataDependency: "OPTIONS_CHAIN",
    refreshPolicy: { kind: "interval", intervalMs: 60_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "alerts",
    title: "Alerts / Observations",
    section: "OBSERVATION",
    componentLoader: placeholderLoader,
    minimumPlan: "professional",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 130,
    desktopOrder: 130,
    priority: 40,
    dataDependency: "SHADOW_STATUS",
    refreshPolicy: { kind: "closed-candle" },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "formula-version",
    title: "Formula Version",
    section: "META",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 4,
    tabletSpan: 1,
    mobileOrder: 140,
    desktopOrder: 140,
    priority: 20,
    dataDependency: "META_ONLY",
    refreshPolicy: { kind: "static" },
    formulaVersion: "GANN_NIFTY_ASTRO_V1_1",
    methodologyLabel: "Engine Metadata",
    supportsFreshness: false,
    supportsCollapse: true,
  },
  {
    id: "data-freshness",
    title: "Data Freshness",
    section: "META",
    componentLoader: placeholderLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 8,
    tabletSpan: 2,
    mobileOrder: 150,
    desktopOrder: 150,
    priority: 30,
    dataDependency: "META_ONLY",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: false,
    required: true,
  },
];

// ---- Legacy `/` dashboard widget set (Phase 24C migration) -----------------
// The canonical `/` route consumes a curated set of widgets whose loaders
// render legacy EagleBABA cards from the shared DashboardDataContext.
// Kept separate from `DASHBOARD_WIDGETS` so the abstract registry (Phase
// 24B) remains untouched and its tests continue to pass.

export const LEGACY_DASHBOARD_WIDGETS: WidgetDefinition[] = [
  {
    id: "legacy-quote",
    title: "Index Quote",
    section: "SUMMARY",
    componentLoader: legacyQuoteLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 10,
    desktopOrder: 10,
    priority: 100,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: false,
    required: true,
  },
  {
    id: "legacy-vix",
    title: "India VIX",
    section: "SUMMARY",
    componentLoader: legacyVixLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 20,
    desktopOrder: 20,
    priority: 90,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-gold-silver",
    title: "Gold–Silver Ratio",
    section: "SIGNAL",
    componentLoader: legacyGoldSilverLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 30,
    desktopOrder: 30,
    priority: 95,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    formulaVersion: "GOLD_SILVER_RATIO_V1",
    methodologyLabel: "Gold–Silver Ratio v1",
    supportsFreshness: true,
    supportsCollapse: true,
    required: true,
  },
  {
    id: "legacy-signal",
    title: "Market Signal",
    section: "SIGNAL",
    componentLoader: legacySignalLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 40,
    desktopOrder: 40,
    priority: 85,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-global-markets",
    title: "Global Markets",
    section: "SUMMARY",
    componentLoader: legacyGlobalMarketsLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 50,
    desktopOrder: 50,
    priority: 70,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
    // Phase 34 · Hidden until a verified provider is wired.
    featureFlag: "dashboard.global-markets",
  },
  {
    id: "legacy-cpr",
    title: "CPR Levels",
    section: "SIGNAL",
    componentLoader: legacyCprLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 60,
    desktopOrder: 60,
    priority: 80,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-safe-zones",
    title: "Safe Zones",
    section: "SIGNAL",
    componentLoader: legacySafeZonesLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 1,
    mobileOrder: 70,
    desktopOrder: 70,
    priority: 65,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-gann",
    title: "Gann 360° Zones",
    section: "SIGNAL",
    componentLoader: legacyGannLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 1,
    mobileOrder: 80,
    desktopOrder: 80,
    priority: 65,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-pivot",
    title: "Pivot Levels",
    section: "SIGNAL",
    componentLoader: legacyPivotLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 90,
    desktopOrder: 90,
    priority: 60,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-gann-cycle",
    title: "Gann Cycle",
    section: "SIGNAL",
    componentLoader: legacyGannCycleLoader,
    minimumPlan: "free",
    enabled: true,
    desktopSpan: 12,
    tabletSpan: 2,
    mobileOrder: 100,
    desktopOrder: 100,
    priority: 55,
    dataDependency: "MARKET_DATA",
    refreshPolicy: { kind: "interval", intervalMs: 30_000 },
    supportsFreshness: true,
    supportsCollapse: true,
  },
  {
    id: "legacy-institutional-flow",
    title: "Institutional Flow",
    section: "OPTIONS",
    componentLoader: legacyInstitutionalFlowLoader,
    minimumPlan: "pro",
    enabled: true,
    desktopSpan: 6,
    tabletSpan: 2,
    mobileOrder: 115,
    desktopOrder: 115,
    priority: 55,
    dataDependency: "OPTIONS_CHAIN",
    refreshPolicy: { kind: "interval", intervalMs: 90_000 },
    methodologyLabel: "Institutional Flow v1",
    formulaVersion: "INSTITUTIONAL_FLOW_V1",
    supportsFreshness: true,
    supportsCollapse: true,
  },
];

export function legacyWidgetsById(): Map<string, WidgetDefinition> {
  return new Map(LEGACY_DASHBOARD_WIDGETS.map((w) => [w.id, w]));
}

// ---- Dependency map --------------------------------------------------------
// Every widget's data dependency maps to a TanStack Query key. Widgets that
// share a dependency MUST reuse the same query result — never fetch again.
export const DATA_DEPENDENCY_QUERY_KEY: Record<WidgetDataDependency, readonly unknown[]> = {
  MARKET_DATA: ["market-data"],
  ASTRO_SNAPSHOT: ["astro-snapshot"],
  DECISION_SNAPSHOT: ["decision-snapshot"],
  OPTIONS_CHAIN: ["options-chain"],
  MARKET_BREADTH: ["market-breadth"],
  PORTFOLIO_SUMMARY: ["portfolio-summary"],
  SHADOW_STATUS: ["shadow-status"],
  GOLD_SILVER_RATIO: ["market-data"], // derived from MARKET_DATA — same key
  NEWS_FEED: ["news-feed"],
  META_ONLY: ["__meta__"],
};

export type ResolveContext = {
  plan: PlanTier;
  role?: UserRole;
  environment?: Environment;
  entitlements?: string[];
  featureFlags?: string[];
};

const PLAN_ORDER: PlanTier[] = ["free", "pro", "professional", "elite", "admin"];

export function planMeets(userPlan: PlanTier, min: PlanTier): boolean {
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(min);
}

export function resolveWidgetsForContext(
  ctx: ResolveContext,
  widgets: WidgetDefinition[] = DASHBOARD_WIDGETS,
): WidgetDefinition[] {
  return widgets.filter((w) => {
    if (!w.enabled) return false;
    if (!planMeets(ctx.plan, w.minimumPlan)) return false;
    if (w.requiredRole && ctx.role !== w.requiredRole && ctx.role !== "admin") return false;
    if (w.environment && ctx.environment && w.environment !== ctx.environment) return false;
    if (w.featureFlag && !(ctx.featureFlags ?? []).includes(w.featureFlag)) return false;
    return true;
  });
}

export function desktopWidgets(ctx: ResolveContext): WidgetDefinition[] {
  return resolveWidgetsForContext(ctx).sort((a, b) => a.desktopOrder - b.desktopOrder);
}
export function mobileWidgets(ctx: ResolveContext): WidgetDefinition[] {
  return resolveWidgetsForContext(ctx).sort((a, b) => a.mobileOrder - b.mobileOrder);
}

export function requiredWidgetIds(widgets: WidgetDefinition[] = DASHBOARD_WIDGETS): string[] {
  return widgets.filter((w) => w.required).map((w) => w.id);
}

// ---- Diagnostics -----------------------------------------------------------
export type RegistryDiagnostics = {
  duplicateIds: string[];
  missingLoaders: string[];
  unconsumedDependencies: WidgetDataDependency[];
  duplicateQueryDependencies: WidgetDataDependency[];
  registered: number;
};

export function auditWidgetRegistry(
  widgets: WidgetDefinition[] = DASHBOARD_WIDGETS,
): RegistryDiagnostics {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const missingLoaders: string[] = [];
  const depCounts = new Map<WidgetDataDependency, number>();

  for (const w of widgets) {
    if (seen.has(w.id)) duplicates.add(w.id);
    seen.add(w.id);
    if (typeof w.componentLoader !== "function") missingLoaders.push(w.id);
    depCounts.set(w.dataDependency, (depCounts.get(w.dataDependency) ?? 0) + 1);
  }

  const allDeps: WidgetDataDependency[] = Object.keys(DATA_DEPENDENCY_QUERY_KEY) as WidgetDataDependency[];
  const unconsumed = allDeps.filter((d) => !depCounts.has(d));
  const duplicated = [...depCounts.entries()].filter(([, n]) => n > 1).map(([d]) => d);

  return {
    duplicateIds: [...duplicates],
    missingLoaders,
    unconsumedDependencies: unconsumed,
    duplicateQueryDependencies: duplicated,
    registered: widgets.length,
  };
}

// ---- Local preferences (research-only, presentation-only) ------------------
export type DashboardPreferences = {
  hidden: string[];
  collapsed: string[];
  desktopOrder: string[];
  mobileOrder: string[];
};

export const EMPTY_PREFERENCES: DashboardPreferences = {
  hidden: [],
  collapsed: [],
  desktopOrder: [],
  mobileOrder: [],
};

export function applyPreferences(
  widgets: WidgetDefinition[],
  prefs: DashboardPreferences,
  device: "desktop" | "mobile",
): WidgetDefinition[] {
  const required = new Set(requiredWidgetIds(widgets));
  const hidden = new Set(prefs.hidden.filter((id) => !required.has(id)));
  const orderList = device === "desktop" ? prefs.desktopOrder : prefs.mobileOrder;
  const visible = widgets.filter((w) => !hidden.has(w.id));

  if (orderList.length === 0) {
    return visible.sort((a, b) =>
      device === "desktop" ? a.desktopOrder - b.desktopOrder : a.mobileOrder - b.mobileOrder,
    );
  }
  const idx = new Map(orderList.map((id, i) => [id, i]));
  return visible.sort((a, b) => {
    const ai = idx.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bi = idx.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) return ai - bi;
    return device === "desktop" ? a.desktopOrder - b.desktopOrder : a.mobileOrder - b.mobileOrder;
  });
}

export function resetPreferences(): DashboardPreferences {
  return { ...EMPTY_PREFERENCES };
}