/**
 * Central role / permission table for the EagleBaba SaaS layer.
 * No feature code should hard-code role strings — always route through
 * `hasPermission(role, "some.capability")` so gating can evolve without a
 * refactor.
 */
export const ROLES = [
  "admin",
  "enterprise",
  "professional",
  "pro",
  "free",
  "guest",
] as const;

export type AppRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  enterprise: "Enterprise",
  professional: "Professional",
  pro: "Pro",
  free: "Free",
  guest: "Guest",
};

/**
 * Coarse role rank — higher numbers grant everything lower numbers grant.
 * Kept small on purpose: individual features gate through PERMISSIONS below.
 */
export const ROLE_RANK: Record<AppRole, number> = {
  guest: 0,
  free: 1,
  pro: 2,
  professional: 3,
  enterprise: 4,
  admin: 5,
};

export type Capability =
  | "read.dashboard"
  | "read.astro"
  | "read.decision"
  | "read.replay"
  | "read.backtest"
  | "read.options"
  | "read.risk"
  | "read.broker"
  | "write.journal"
  | "write.watchlist"
  | "write.layout"
  | "write.settings"
  | "cloud.sync"
  | "admin.console";

const MIN_ROLE: Record<Capability, AppRole> = {
  "read.dashboard": "guest",
  "read.astro": "guest",
  "read.decision": "free",
  "read.replay": "free",
  "read.backtest": "free",
  "read.options": "free",
  "read.risk": "free",
  "read.broker": "pro",
  "write.journal": "free",
  "write.watchlist": "free",
  "write.layout": "free",
  "write.settings": "free",
  "cloud.sync": "free",
  "admin.console": "admin",
};

export function hasPermission(role: AppRole | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[MIN_ROLE[cap]];
}

export function highestRole(roles: readonly AppRole[]): AppRole {
  if (roles.length === 0) return "guest";
  return roles.reduce<AppRole>(
    (best, r) => (ROLE_RANK[r] > ROLE_RANK[best] ? r : best),
    roles[0],
  );
}

export const PLAN_FOR_ROLE: Record<AppRole, string> = {
  admin: "Enterprise",
  enterprise: "Enterprise",
  professional: "Professional",
  pro: "Pro",
  free: "Free",
  guest: "Guest",
};