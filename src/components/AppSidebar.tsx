import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { desktopNav, mobileBottomNav, type NavItem } from "@/lib/navigation";
import { EagleLogo } from "@/components/EagleLogo";

type Item = NavItem;

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const items = desktopNav();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const width = collapsed ? 68 : 210;

  const isActive = (it: Item) => {
    if (!it.to) return false;
    if (it.to === "/") return path === "/" && it.id === "dashboard";
    // Handle hash-based routes (e.g. /live-market-terminal#live-chart)
    const [itemPath, itemHash] = it.to.split("#");
    if (itemHash) {
      return path === itemPath && hash === `#${itemHash}`;
    }
    // For non-hash items, only match if there's no hash in current URL
    // (prevents Market Terminal from highlighting when Live Chart hash is active)
    if (path === "/live-market-terminal" && hash === "#live-chart") {
      return it.id === "live-market-terminal" ? false : path === itemPath;
    }
    return path === itemPath;
  };

  return (
    <aside className="eb-sidebar" style={{ width }} data-collapsed={collapsed}>
      <div className="eb-sidebar-inner eb-glass">
        <div className="flex items-center justify-between px-2.5 py-2 mb-1 border-b border-zinc-800/60">
          <Link to="/" className="flex items-center gap-2 min-w-0" aria-label="EagleBABA Home">
            <EagleLogo
              size={28}
              className="w-7 h-7 rounded-lg object-cover border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)] shrink-0"
            />
            {!collapsed ? (
              <span className="font-bold text-xs tracking-wider text-amber-400 font-mono truncate">
                EagleBABA
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="eb-sb-nav">
          {items.map((it) => {
            const active = isActive(it);
            const Icon = it.icon;
            const content = (
              <>
                <span className="eb-sb-ico">
                  <Icon size={19} />
                </span>
                {!collapsed ? (
                  <span className="eb-sb-label flex items-center justify-between flex-1">
                    <span>{it.label}</span>
                    {it.badge ? (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {it.badge}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {active ? <span className="eb-sb-active" aria-hidden /> : null}
              </>
            );
            const cls = `eb-sb-item${active ? " is-active text-amber-400 border-amber-500/40 bg-amber-500/10 shadow-[0_0_12px_rgba(245,158,11,0.15)]" : ""}`;
            return it.to ? (
              <Link key={it.id} to={it.to} className={cls} title={it.label}>
                {content}
              </Link>
            ) : (
              <a key={it.id} href={it.href} className={cls} title={it.label}>
                {content}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}

/* ------------------------- Mobile bottom navigation ------------------------ */

export function MobileBottomNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const items = mobileBottomNav();
  return (
    <nav
      className="eb-bottomnav fixed bottom-3 inset-x-0 mx-auto z-50 block lg:hidden max-w-sm bg-[#0b0f17] border border-amber-500/35 rounded-[20px] shadow-[0_10px_35px_rgba(0,0,0,0.95)] shadow-amber-500/10 backdrop-blur-xl"
      style={{ backgroundColor: "#0b0f17", opacity: 1 }}
      aria-label="Primary"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = path === it.to;
        return (
          <Link
            key={it.id}
            to={it.to!}
            className={`eb-bn-item${
              active
                ? " is-active bg-amber-500/20 border border-amber-500/50 text-amber-300 font-semibold"
                : " text-zinc-400 font-medium hover:text-zinc-200"
            }`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} className={active ? "text-amber-300" : "text-zinc-400"} />
            <span className={active ? "text-amber-300 font-semibold" : "text-zinc-400 font-medium"}>
              {it.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
