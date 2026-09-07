import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { desktopNav, mobileBottomNav, type NavItem } from "@/lib/navigation";

type Item = NavItem;
const ITEMS = desktopNav();

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
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
    <nav className="eb-bottomnav eb-glass" aria-label="Primary">
      {items.map((it) => {
        const Icon = it.icon;
        const active = path === it.to;
        return (
          <Link
            key={it.id}
            to={it.to!}
            className={`eb-bn-item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
