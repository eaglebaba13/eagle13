import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
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
  Target,
  History,
  BarChart3,
  PlayCircle,
  Layers,
  Brain,
  Menu as MenuIcon,
  X,
} from "lucide-react";
import logoUrl from "@/assets/eaglebaba-logo.png";

type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  to?: string;
  href?: string;
};

const DRAWER_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "NIFTY50 Buying Strategy", icon: Target, to: "/option-strategy" },
  { label: "Market", icon: CandlestickChart, to: "/" },
  { label: "Live Astro", icon: Orbit, to: "/astro" },
  { label: "Live Terminal", icon: Radio, to: "/live-terminal" },
  { label: "Market Terminal", icon: Activity, to: "/live-market-terminal" },
  { label: "Level Terminal", icon: TrendingUp, to: "/live-levels" },
  { label: "Backtest", icon: History, to: "/backtest" },
  { label: "Signal Accuracy", icon: BarChart3, to: "/signal-accuracy" },
  { label: "Market Replay", icon: PlayCircle, to: "/market-replay" },
  { label: "Options Analytics", icon: Layers, to: "/options-analytics" },
  { label: "Decision Engine", icon: Brain, to: "/decision" },
  { label: "Planets", icon: Globe2, href: "#planets" },
  { label: "Nakshatra", icon: Sparkles, href: "#nakshatra" },
  { label: "Support / Resistance", icon: TrendingUp, href: "#levels" },
  { label: "Signals", icon: Radar, href: "#signals" },
  { label: "Analysis", icon: LineChart, href: "#analysis" },
  { label: "Reports", icon: FileBarChart, href: "#reports" },
  { label: "Settings", icon: Settings, href: "#settings" },
];

type BottomItem = { label: string; icon: React.ComponentType<{ size?: number }>; to?: string; action?: "menu" };

const BOTTOM_ITEMS: BottomItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { label: "Market", icon: CandlestickChart, to: "/live-levels" },
  { label: "Signals", icon: Activity, to: "/live-market-terminal" },
  { label: "Astro", icon: Orbit, to: "/astro" },
  { label: "Menu", icon: MenuIcon, action: "menu" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Lock body scroll + ESC to close + focus trap while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    // Move focus into the drawer for screen readers / keyboard users.
    const t = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    }, 60);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      triggerRef.current?.focus();
    };
  }, [open]);

  const isActive = (it: NavItem | BottomItem) => {
    if (!it.to) return false;
    if (it.to === "/") return path === "/" && it.label === "Dashboard";
    return path === it.to;
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // Swipe left to dismiss.
    if (info.offset.x < -60 || info.velocity.x < -400) setOpen(false);
  };

  return (
    <>
      {/* Sticky mobile top bar: hamburger beside the EagleBABA logo */}
      <header className="eb-mtopbar eb-glass" role="banner">
        <button
          ref={triggerRef}
          type="button"
          className="eb-burger"
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="eb-mobile-drawer"
          onClick={() => setOpen(true)}
        >
          <MenuIcon size={22} />
        </button>
        <Link to="/" className="eb-mtopbar-brand" aria-label="EagleBABA home">
          <img src={logoUrl} alt="EagleBABA logo" width={30} height={30} />
          <span>EagleBABA</span>
        </Link>
      </header>

      {/* Slide drawer */}
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="eb-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              id="eb-mobile-drawer"
              ref={drawerRef}
              className="eb-drawer eb-glass"
              role="dialog"
              aria-modal="true"
              aria-label="Main navigation"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={onDragEnd}
            >
              <div className="eb-drawer-head">
                <div className="eb-drawer-brand">
                  <img src={logoUrl} alt="EagleBABA logo" width={34} height={34} />
                  <div>
                    <div className="eb-drawer-title">EagleBABA</div>
                    <div className="eb-drawer-sub">Astro Trading Terminal</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="eb-drawer-close"
                  aria-label="Close navigation menu"
                  onClick={() => setOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <nav className="eb-drawer-nav" aria-label="Primary">
                {DRAWER_ITEMS.map((it) => {
                  const Icon = it.icon;
                  const active = isActive(it);
                  const cls = `eb-drawer-item${active ? " is-active" : ""}`;
                  const inner = (
                    <>
                      <span className="eb-drawer-ico">
                        <Icon size={19} />
                      </span>
                      <span className="eb-drawer-label">{it.label}</span>
                      {active ? <span className="eb-drawer-dot" aria-hidden /> : null}
                    </>
                  );
                  return it.to ? (
                    <Link
                      key={it.label}
                      to={it.to}
                      className={cls}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <a key={it.label} href={it.href} className={cls} onClick={() => setOpen(false)}>
                      {inner}
                    </a>
                  );
                })}
              </nav>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>

      {/* Bottom navigation */}
      <nav className="eb-mbottomnav eb-glass" aria-label="Quick navigation">
        {BOTTOM_ITEMS.map((it) => {
          const Icon = it.icon;
          if (it.action === "menu") {
            return (
              <button
                key={it.label}
                type="button"
                className="eb-mbn-item"
                aria-label="Open menu"
                onClick={() => setOpen(true)}
              >
                <Icon size={21} />
                <span>{it.label}</span>
              </button>
            );
          }
          const active = path === it.to;
          return (
            <Link
              key={it.label}
              to={it.to}
              className={`eb-mbn-item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
