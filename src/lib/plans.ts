/**
 * Phase 20.2 — Central plan definitions and entitlement matrix.
 * Single source of truth for pricing, limits and feature capabilities.
 * Plan/feature code MUST route through this module — never hardcode
 * plan names inside route components.
 */
import type { AppRole } from "./roles";

export const PLAN_IDS = ["free", "pro", "professional", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "suspended"
  | "incomplete";

export type Capability =
  | "dashboard.basic"
  | "dashboard.premium"
  | "astro.live"
  | "astro.levels"
  | "market.terminal"
  | "market.replay"
  | "backtest.basic"
  | "backtest.advanced"
  | "signal.accuracy"
  | "options.analytics"
  | "decision.intelligence"
  | "risk.manager"
  | "broker.paper"
  | "broker.live"
  | "exports.csv"
  | "exports.json"
  | "exports.excel"
  | "exports.pdf"
  | "watchlists.multiple"
  | "layouts.multiple"
  | "journal.cloud"
  | "notifications.basic"
  | "notifications.advanced"
  | "team.workspace"
  | "admin.console";

export interface UsageLimits {
  watchlists: number;
  layouts: number;
  replayPresets: number;
  backtestsPerDay: number;
  exportsPerDay: number;
  alertRules: number;
  journalEntries: number;
  teamMembers: number;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number | null; // in INR (placeholder until billing wired)
  annualPrice: number | null;
  trialDays: number;
  status: "available" | "beta" | "contact";
  capabilities: readonly Capability[];
  limits: UsageLimits;
  recommended?: boolean;
  contactSales?: boolean;
}

const FREE_CAPS: readonly Capability[] = [
  "dashboard.basic",
  "astro.levels",
  "backtest.basic",
  "exports.csv",
  "journal.cloud",
  "notifications.basic",
];

const PRO_CAPS: readonly Capability[] = [
  ...FREE_CAPS,
  "astro.live",
  "market.terminal",
  "watchlists.multiple",
  "layouts.multiple",
  "signal.accuracy",
];

const PROFESSIONAL_CAPS: readonly Capability[] = [
  ...PRO_CAPS,
  "dashboard.premium",
  "market.replay",
  "backtest.advanced",
  "options.analytics",
  "decision.intelligence",
  "risk.manager",
  "broker.paper",
  "exports.json",
  "exports.excel",
  "exports.pdf",
  "notifications.advanced",
];

const ENTERPRISE_CAPS: readonly Capability[] = [
  ...PROFESSIONAL_CAPS,
  "broker.live",
  "team.workspace",
  "admin.console",
];

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description:
      "Astro Level Dashboard, basic market view, one watchlist, and a basic journal for casual exploration.",
    monthlyPrice: 0,
    annualPrice: 0,
    trialDays: 0,
    status: "available",
    capabilities: FREE_CAPS,
    limits: {
      watchlists: 1,
      layouts: 1,
      replayPresets: 0,
      backtestsPerDay: 2,
      exportsPerDay: 3,
      alertRules: 3,
      journalEntries: 50,
      teamMembers: 0,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description:
      "Live Astro & Level terminals, multiple watchlists, cloud journal, signal accuracy analytics.",
    monthlyPrice: 999,
    annualPrice: 9990,
    trialDays: 14,
    status: "available",
    capabilities: PRO_CAPS,
    recommended: true,
    limits: {
      watchlists: 10,
      layouts: 5,
      replayPresets: 5,
      backtestsPerDay: 20,
      exportsPerDay: 25,
      alertRules: 25,
      journalEntries: 5000,
      teamMembers: 0,
    },
  },
  professional: {
    id: "professional",
    name: "Professional",
    description:
      "Everything in Pro plus Options Analytics, Decision Engine, Risk Manager, Market Replay, advanced exports and paper trading.",
    monthlyPrice: 2499,
    annualPrice: 24990,
    trialDays: 14,
    status: "available",
    capabilities: PROFESSIONAL_CAPS,
    limits: {
      watchlists: 50,
      layouts: 25,
      replayPresets: 50,
      backtestsPerDay: 100,
      exportsPerDay: 200,
      alertRules: 200,
      journalEntries: 50000,
      teamMembers: 0,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description:
      "Team workspace, shared layouts, live broker access, priority support and custom usage limits.",
    monthlyPrice: null,
    annualPrice: null,
    trialDays: 30,
    status: "contact",
    capabilities: ENTERPRISE_CAPS,
    contactSales: true,
    limits: {
      watchlists: 500,
      layouts: 250,
      replayPresets: 500,
      backtestsPerDay: 1000,
      exportsPerDay: 2000,
      alertRules: 2000,
      journalEntries: 1_000_000,
      teamMembers: 25,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "professional", "enterprise"];

export function planRank(id: PlanId): number {
  return PLAN_ORDER.indexOf(id);
}

/** Return the highest plan available to a given role (used for admin overrides). */
export function planForRole(role: AppRole): PlanId {
  switch (role) {
    case "admin":
    case "enterprise":
      return "enterprise";
    case "professional":
      return "professional";
    case "pro":
      return "pro";
    case "free":
    case "guest":
    default:
      return "free";
  }
}

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS[id];
}