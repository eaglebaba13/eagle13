import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  CandlestickChart,
  Orbit,
  Radio,
  Activity,
  Globe2,
  Sparkles,
  TrendingUp,
  Radar,
  LineChart,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Item = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  to?: string;
  href?: string;
};

const ITEMS: Item[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Market", icon: CandlestickChart, to: "/" },
  { label: "Live Astro", icon: Orbit, to: "/astro" },
  { label: "Live Terminal", icon: Radio, to: "/live-terminal" },
  { label: "Market Terminal", icon: Activity, to: "/live-market-terminal" },
  { label: "Level Terminal", icon: TrendingUp, to: "/live-levels" },
  { label: "Planets", icon: Globe2, href: "#planets" },
  { label: "Nakshatra", icon: Sparkles, href: "#nakshatra" },
  { label: "Support / Resistance", icon: TrendingUp, href: "#levels" },
  { label: "Signals", icon: Radar, href: "#signals" },
  { label: "Analysis", icon: LineChart, href: "#analysis" },
  { label: "Reports", icon: FileBarChart, href: "#reports" },
  { label: "Settings", icon: Settings, href: "#settings" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const width = collapsed ? 68 : 210;

  const isActive = (it: Item) => {
    if (it.to === "/astro") return path === "/astro";
    if (it.to === "/live-terminal") return path === "/live-terminal";
    if (it.to === "/live-market-terminal") return path === "/live-market-terminal";
    if (it.to === "/live-levels") return path === "/live-levels";
    if (it.to === "/") return path === "/" && it.label === "Dashboard";
    return false;
  };

  return (
    <aside className="eb-sidebar" style={{ width }} data-collapsed={collapsed}>
      <div className="eb-sidebar-inner eb-glass">
        <button
          type="button"
          className="eb-sb-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed ? <span>Collapse</span> : null}
        </button>

        <nav className="eb-sb-nav">
          {ITEMS.map((it) => {
            const active = isActive(it);
            const Icon = it.icon;
            const content = (
              <>
                <span className="eb-sb-ico">
                  <Icon size={19} />
                </span>
                {!collapsed ? <span className="eb-sb-label">{it.label}</span> : null}
                {active ? <span className="eb-sb-active" aria-hidden /> : null}
              </>
            );
            const cls = `eb-sb-item${active ? " is-active" : ""}`;
            return it.to ? (
              <Link key={it.label} to={it.to} className={cls} title={it.label}>
                {content}
              </Link>
            ) : (
              <a key={it.label} href={it.href} className={cls} title={it.label}>
                {content}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
