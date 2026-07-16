import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { desktopNav, mobileBottomNav, type NavItem } from "@/lib/navigation";

type Item = NavItem;
const ITEMS = desktopNav();

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const width = collapsed ? 68 : 210;

  const isActive = (it: Item) => {
    if (!it.to) return false;
    if (it.to === "/") return path === "/" && it.id === "dashboard";
    return path === it.to;
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
