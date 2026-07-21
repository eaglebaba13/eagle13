// Phase 24A · Single navigation registry.
//
// This is the ONE source of truth consumed by the desktop sidebar, the
// mobile drawer, and the mobile bottom-nav. Menu arrays must not be
// hard-coded anywhere else.

import {
  Activity,
  BarChart3,
  Bell,
  Brain,
  CandlestickChart,
  FileBarChart,
  Globe2,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  Orbit,
  PlayCircle,
  Plug,
  Radar,
  Radio,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  User as UserIcon,
} from "lucide-react";

export type NavSection = "MAIN" | "RESEARCH" | "MARKET" | "ACCOUNT";

export type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  to?: string;
  href?: string;
  section: NavSection;
  order: number;
  desktopVisible: boolean;
  mobileVisible: boolean;
  mobileBottom?: boolean; // included in the mobile bottom-nav shortcuts
  bottomOrder?: number;
  minimumPlan?: "free" | "pro" | "elite";
  requiredRole?: "user" | "admin";
};

export type NavContext = {
  plan?: "free" | "pro" | "professional" | "elite" | "admin";
  role?: "user" | "pro" | "professional" | "admin";
  environment?: "development" | "production";
  entitlements?: string[];
  featureFlags?: string[];
};

const PLAN_ORDER = ["free", "pro", "professional", "elite", "admin"] as const;
function planIndex(p: string | undefined): number {
  if (!p) return 0;
  const i = PLAN_ORDER.indexOf(p as (typeof PLAN_ORDER)[number]);
  return i < 0 ? 0 : i;
}

function passesContext(it: NavItem, ctx: NavContext): boolean {
  if (it.minimumPlan && planIndex(ctx.plan) < planIndex(it.minimumPlan)) return false;
  if (it.requiredRole && ctx.role !== it.requiredRole && ctx.role !== "admin") return false;
  return true;
}

export function resolveNavigationForContext(ctx: NavContext = {}): NavItem[] {
  return NAV_REGISTRY.filter((it) => passesContext(it, ctx)).sort((a, b) => a.order - b.order);
}

export function resolveDesktopNav(ctx: NavContext = {}): NavItem[] {
  return resolveNavigationForContext(ctx).filter((it) => it.desktopVisible);
}

export function resolveMobileDrawerNav(ctx: NavContext = {}): NavItem[] {
  return resolveNavigationForContext(ctx).filter((it) => it.mobileVisible);
}

export function resolveMobileBottomNav(ctx: NavContext = {}): NavItem[] {
  return resolveNavigationForContext(ctx)
    .filter((it) => it.mobileBottom && it.mobileVisible)
    .sort((a, b) => (a.bottomOrder ?? 999) - (b.bottomOrder ?? 999));
}

export const NAV_REGISTRY: NavItem[] = [
  // MAIN
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/", section: "MAIN", order: 10, desktopVisible: true, mobileVisible: true, mobileBottom: true, bottomOrder: 1 },
  { id: "astro-levels", label: "Astro Levels", icon: Orbit, to: "/astro", section: "MAIN", order: 20, desktopVisible: true, mobileVisible: true, mobileBottom: true, bottomOrder: 2 },
  { id: "live-terminal", label: "Live Terminal", icon: Radio, to: "/live-terminal", section: "MAIN", order: 30, desktopVisible: true, mobileVisible: true },
  { id: "live-market-terminal", label: "Market Terminal", icon: Activity, to: "/live-market-terminal", section: "MAIN", order: 40, desktopVisible: true, mobileVisible: true, mobileBottom: true, bottomOrder: 3 },
  { id: "level-terminal", label: "Level Terminal", icon: TrendingUp, to: "/live-levels", section: "MAIN", order: 50, desktopVisible: true, mobileVisible: true },
  { id: "decision", label: "Decision", icon: Brain, to: "/decision", section: "MAIN", order: 60, desktopVisible: true, mobileVisible: true },
  { id: "risk", label: "Risk", icon: ShieldCheck, to: "/risk", section: "MAIN", order: 70, desktopVisible: true, mobileVisible: true },

  // RESEARCH
  { id: "backtest", label: "Backtest", icon: History, to: "/backtest", section: "RESEARCH", order: 110, desktopVisible: true, mobileVisible: true },
  { id: "signal-accuracy", label: "Signal Accuracy", icon: BarChart3, to: "/signal-accuracy", section: "RESEARCH", order: 120, desktopVisible: true, mobileVisible: true },
  { id: "market-replay", label: "Market Replay", icon: PlayCircle, to: "/market-replay", section: "RESEARCH", order: 130, desktopVisible: true, mobileVisible: true },
  { id: "combined-pcr", label: "Combined PCR — Coming Next", icon: Layers, to: "/combined-pcr", section: "RESEARCH", order: 140, desktopVisible: true, mobileVisible: true },
  { id: "strategy-analytics", label: "Strategy Analytics", icon: BarChart3, to: "/strategy-analytics", section: "RESEARCH", order: 145, desktopVisible: true, mobileVisible: true },

  // MARKET
  { id: "option-strategy", label: "NIFTY50 Buying", icon: Target, to: "/option-strategy", section: "MARKET", order: 210, desktopVisible: true, mobileVisible: true },
  { id: "market-breadth", label: "Market Breadth", icon: Activity, to: "/market-breadth", section: "MARKET", order: 215, desktopVisible: true, mobileVisible: true },
  { id: "options-analytics", label: "Options Analytics", icon: Layers, to: "/options-analytics", section: "MARKET", order: 220, desktopVisible: true, mobileVisible: true },
  { id: "options-chain", label: "Options Chain", icon: Layers, to: "/options-chain", section: "MARKET", order: 225, desktopVisible: true, mobileVisible: true },
  { id: "live-option-terminal", label: "Option Strategy Terminal", icon: Target, to: "/live-option-terminal", section: "MARKET", order: 227, desktopVisible: true, mobileVisible: true },
  { id: "ai-market-assistant", label: "AI Market Assistant", icon: Brain, to: "/ai-market-assistant", section: "MARKET", order: 228, desktopVisible: true, mobileVisible: true },
  { id: "alerts", label: "Alert Center", icon: Bell, to: "/alerts", section: "MARKET", order: 229, desktopVisible: true, mobileVisible: true },
  { id: "signal-history", label: "Signal History", icon: History, to: "/signal-history", section: "MARKET", order: 231, desktopVisible: true, mobileVisible: true },
  { id: "telegram-log", label: "Telegram Log", icon: Radio, to: "/telegram-log", section: "MARKET", order: 232, desktopVisible: true, mobileVisible: true },
  { id: "multi-asset-intelligence", label: "Multi-Asset Intelligence", icon: Radio, to: "/multi-asset-intelligence", section: "MARKET", order: 233, desktopVisible: true, mobileVisible: true },
  { id: "institutional-intelligence", label: "Institutional Intelligence", icon: Activity, to: "/institutional-intelligence", section: "MARKET", order: 234, desktopVisible: true, mobileVisible: true },
  { id: "broker", label: "Broker", icon: Plug, to: "/broker", section: "MARKET", order: 230, desktopVisible: true, mobileVisible: true },

  // ACCOUNT
  { id: "profile", label: "Profile", icon: UserIcon, to: "/profile", section: "ACCOUNT", order: 310, desktopVisible: true, mobileVisible: true },
  { id: "notifications", label: "Notifications", icon: Bell, to: "/notifications", section: "ACCOUNT", order: 309, desktopVisible: true, mobileVisible: true },
  { id: "referrals", label: "Referrals", icon: KeyRound, to: "/referrals", section: "ACCOUNT", order: 311, desktopVisible: true, mobileVisible: true },
  { id: "admin-launch-readiness", label: "Launch Readiness", icon: ShieldCheck, to: "/admin/launch-readiness", section: "ACCOUNT", order: 305, desktopVisible: true, mobileVisible: true, requiredRole: "admin" },
  { id: "admin-referrals", label: "Referrals (Admin)", icon: KeyRound, to: "/admin/referrals", section: "ACCOUNT", order: 304, desktopVisible: true, mobileVisible: true, requiredRole: "admin" },
  { id: "admin-system-status", label: "System Status", icon: Activity, to: "/admin/system-status", section: "ACCOUNT", order: 306, desktopVisible: true, mobileVisible: true, requiredRole: "admin" },
  { id: "admin-beta-readiness", label: "Beta Readiness", icon: ShieldCheck, to: "/admin/beta-readiness", section: "ACCOUNT", order: 307, desktopVisible: true, mobileVisible: true, requiredRole: "admin" },
  { id: "admin-alerts", label: "Smart Alerts (Admin)", icon: Bell, to: "/admin/alerts", section: "ACCOUNT", order: 308, desktopVisible: true, mobileVisible: true, requiredRole: "admin" },
  { id: "admin-widgets", label: "Widget Toggles", icon: Settings, to: "/admin/widgets", section: "ACCOUNT", order: 309, desktopVisible: true, mobileVisible: true, requiredRole: "admin" },
  { id: "license", label: "License", icon: KeyRound, to: "/license", section: "ACCOUNT", order: 320, desktopVisible: true, mobileVisible: true },
  { id: "billing", label: "Billing", icon: ScrollText, to: "/billing", section: "ACCOUNT", order: 330, desktopVisible: true, mobileVisible: true },
  { id: "pricing", label: "Pricing", icon: FileBarChart, to: "/pricing", section: "ACCOUNT", order: 340, desktopVisible: true, mobileVisible: true },
  { id: "settings", label: "Settings", icon: Settings, to: "/settings", section: "ACCOUNT", order: 350, desktopVisible: true, mobileVisible: true },

  // Anchor shortcuts (hash links) — still available in both menus.
  { id: "planets", label: "Planets", icon: Globe2, href: "#planets", section: "MARKET", order: 410, desktopVisible: true, mobileVisible: true },
  { id: "nakshatra", label: "Nakshatra", icon: Sparkles, href: "#nakshatra", section: "MARKET", order: 420, desktopVisible: true, mobileVisible: true },
  { id: "support-resistance", label: "Support / Resistance", icon: TrendingUp, href: "#levels", section: "MARKET", order: 430, desktopVisible: true, mobileVisible: true },
  { id: "signals", label: "Signals", icon: Radar, href: "#signals", section: "MARKET", order: 440, desktopVisible: true, mobileVisible: true },
  { id: "analysis", label: "Analysis", icon: LineChart, href: "#analysis", section: "MARKET", order: 450, desktopVisible: true, mobileVisible: true },
  { id: "reports", label: "Reports", icon: FileBarChart, href: "#reports", section: "MARKET", order: 460, desktopVisible: true, mobileVisible: true },
  { id: "market-mini", label: "Market", icon: CandlestickChart, to: "/live-levels", section: "MARKET", order: 470, desktopVisible: true, mobileVisible: true },
];

export function desktopNav(): NavItem[] {
  return NAV_REGISTRY.filter((it) => it.desktopVisible).sort((a, b) => a.order - b.order);
}

export function mobileDrawerNav(): NavItem[] {
  return NAV_REGISTRY.filter((it) => it.mobileVisible).sort((a, b) => a.order - b.order);
}

export function mobileBottomNav(): NavItem[] {
  return NAV_REGISTRY
    .filter((it) => it.mobileBottom && it.mobileVisible)
    .sort((a, b) => (a.bottomOrder ?? 999) - (b.bottomOrder ?? 999));
}