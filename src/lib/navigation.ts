// Navigation registry — single source of truth for desktop sidebar,
// mobile drawer, and mobile bottom-nav.

import {
  Activity,
  BarChart3,
  Bell,
  Brain,
  History,
  Layers,
  LayoutDashboard,
  Orbit,
  PlayCircle,
  Radio,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";

export type NavStatus = "LIVE" | "RESEARCH" | "PROVIDER_PENDING" | "COMING_SOON" | "INTERNAL";

export type NavSection = "CORE" | "ANALYTICS" | "ALERTS" | "INTELLIGENCE" | "SYSTEM";

export type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  to?: string;
  href?: string;
  section: NavSection;
  order: number;
  status: NavStatus;
  desktopVisible: boolean;
  mobileVisible: boolean;
  mobileBottom?: boolean;
  bottomOrder?: number;
};

export const NAV_REGISTRY: NavItem[] = [
  // CORE
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    to: "/",
    section: "CORE",
    order: 10,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
    mobileBottom: true,
    bottomOrder: 1,
  },
  {
    id: "astro-levels",
    label: "Astro Levels",
    icon: Orbit,
    to: "/astro",
    section: "CORE",
    order: 20,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
    mobileBottom: true,
    bottomOrder: 2,
  },
  {
    id: "live-terminal",
    label: "Live Terminal",
    icon: Radio,
    to: "/live-terminal",
    section: "CORE",
    order: 30,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "live-market-terminal",
    label: "Market Terminal",
    icon: Activity,
    to: "/live-market-terminal",
    section: "CORE",
    order: 40,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
    mobileBottom: true,
    bottomOrder: 3,
  },
  {
    id: "live-chart",
    label: "Live Chart",
    icon: BarChart3,
    to: "/live-chart",
    section: "CORE",
    order: 41,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "level-terminal",
    label: "Level Terminal",
    icon: TrendingUp,
    to: "/live-levels",
    section: "CORE",
    order: 50,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "decision",
    label: "Decision",
    icon: Brain,
    to: "/decision",
    section: "CORE",
    order: 60,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
  },

  // ANALYTICS
  {
    id: "backtest",
    label: "Backtest",
    icon: History,
    to: "/backtest",
    section: "ANALYTICS",
    order: 110,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "signal-accuracy",
    label: "Signal Accuracy",
    icon: BarChart3,
    to: "/signal-accuracy",
    section: "ANALYTICS",
    order: 120,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "market-replay",
    label: "Market Replay",
    icon: PlayCircle,
    to: "/market-replay",
    section: "ANALYTICS",
    order: 130,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "options-chain",
    label: "Options Chain",
    icon: Layers,
    to: "/options-chain",
    section: "ANALYTICS",
    order: 140,
    status: "PROVIDER_PENDING",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "options-analytics",
    label: "Options Analytics",
    icon: Layers,
    to: "/options-analytics",
    section: "ANALYTICS",
    order: 150,
    status: "PROVIDER_PENDING",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "combined-pcr",
    label: "Combined PCR",
    icon: Layers,
    to: "/combined-pcr",
    section: "ANALYTICS",
    order: 155,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "market-breadth",
    label: "Market Breadth",
    icon: Activity,
    to: "/market-breadth",
    section: "ANALYTICS",
    order: 160,
    status: "PROVIDER_PENDING",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "strategy-analytics",
    label: "Strategy Analytics",
    icon: BarChart3,
    to: "/strategy-analytics",
    section: "ANALYTICS",
    order: 170,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "option-strategy",
    label: "NIFTY50 Buying",
    icon: Target,
    to: "/option-strategy",
    section: "ANALYTICS",
    order: 180,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
  },

  // ALERTS
  {
    id: "alerts",
    label: "Alert Center",
    icon: Bell,
    to: "/alerts",
    section: "ALERTS",
    order: 210,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "telegram-log",
    label: "Telegram Log",
    icon: Radio,
    to: "/telegram-log",
    section: "ALERTS",
    order: 220,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },

  // INTELLIGENCE
  {
    id: "live-option-terminal",
    label: "Option Strategy Terminal",
    icon: Target,
    to: "/live-option-terminal",
    section: "INTELLIGENCE",
    order: 310,
    status: "LIVE",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "ai-market-assistant",
    label: "AI Market Assistant",
    icon: Brain,
    to: "/ai-market-assistant",
    section: "INTELLIGENCE",
    order: 320,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "institutional-flow",
    label: "Institutional Flow",
    icon: Activity,
    to: "/institutional-flow",
    section: "INTELLIGENCE",
    order: 330,
    status: "PROVIDER_PENDING",
    desktopVisible: true,
    mobileVisible: true,
  },
  {
    id: "multi-asset-intelligence",
    label: "Multi-Asset Intelligence",
    icon: Radio,
    to: "/multi-asset-intelligence",
    section: "INTELLIGENCE",
    order: 340,
    status: "RESEARCH",
    desktopVisible: true,
    mobileVisible: true,
  },

  // SYSTEM
  {
    id: "status",
    label: "System Status",
    icon: ShieldCheck,
    to: "/status",
    section: "SYSTEM",
    order: 410,
    status: "INTERNAL",
    desktopVisible: true,
    mobileVisible: false,
  },
  {
    id: "provider-health",
    label: "Provider Health",
    icon: ShieldCheck,
    to: "/admin/providers",
    section: "SYSTEM",
    order: 420,
    status: "INTERNAL",
    desktopVisible: true,
    mobileVisible: false,
  },
];

export function desktopNav(): NavItem[] {
  return NAV_REGISTRY.filter((it) => it.desktopVisible).sort((a, b) => a.order - b.order);
}

export function mobileDrawerNav(): NavItem[] {
  return NAV_REGISTRY.filter((it) => it.mobileVisible).sort((a, b) => a.order - b.order);
}

export function mobileBottomNav(): NavItem[] {
  return NAV_REGISTRY.filter((it) => it.mobileBottom && it.mobileVisible).sort(
    (a, b) => (a.bottomOrder ?? 999) - (b.bottomOrder ?? 999),
  );
}

// Backward-compatible exports (personal terminal — all items visible)
export type NavContext = Record<string, never>;
export function resolveNavigationForContext(_ctx: NavContext = {}): NavItem[] {
  return NAV_REGISTRY.sort((a, b) => a.order - b.order);
}
export function resolveDesktopNav(_ctx: NavContext = {}): NavItem[] {
  return desktopNav();
}
export function resolveMobileDrawerNav(_ctx: NavContext = {}): NavItem[] {
  return mobileDrawerNav();
}
export function resolveMobileBottomNav(_ctx: NavContext = {}): NavItem[] {
  return mobileBottomNav();
}
