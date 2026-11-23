import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Search } from "lucide-react";
import { useNavDrawer } from "@/context/nav-drawer-context";
import { desktopNav, type NavItem, type NavSection } from "@/lib/navigation";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/roles";

const SECTION_LABELS: Record<NavSection, string> = {
  CORE: "Core Workstations & Radar",
  ANALYTICS: "Quantitative & Option Analytics",
  ALERTS: "Realtime Alerts & Telegram",
  INTELLIGENCE: "Institutional Intelligence",
  SYSTEM: "Platform & Administration",
};

export function GlobalNavDrawer() {
  const { isOpen, closeDrawer } = useNavDrawer();
  const { role, isGuest } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const hash = typeof window !== "undefined" ? window.location.hash : "";

  const drawerRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Lock body scroll + ESC to close + keyboard navigation trap
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, closeDrawer]);

  const allItems = useMemo(() => {
    return desktopNav().filter(
      (item) => !item.to?.startsWith("/admin/") || (!isGuest && hasPermission(role, "admin.console")),
    );
  }, [role, isGuest]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return allItems;
    const query = searchQuery.toLowerCase().trim();
    return allItems.filter(
      (it) =>
        it.label.toLowerCase().includes(query) ||
        it.section.toLowerCase().includes(query) ||
        (it.badge && it.badge.toLowerCase().includes(query)),
    );
  }, [allItems, searchQuery]);

  const groupedItems = useMemo(() => {
    const groups = new Map<NavSection, NavItem[]>();
    for (const item of filteredItems) {
      const list = groups.get(item.section) ?? [];
      list.push(item);
      groups.set(item.section, list);
    }
    return Array.from(groups.entries());
  }, [filteredItems]);

  const isActive = (it: NavItem) => {
    if (!it.to) return false;
    if (it.to === "/") return path === "/" && it.id === "dashboard";
    const [itemPath, itemHash] = it.to.split("#");
    if (itemHash) {
      return path === itemPath && hash === `#${itemHash}`;
    }
    if (path === "/live-market-terminal" && hash === "#live-chart") {
      return it.id === "live-market-terminal" ? false : path === itemPath;
    }
    return path === itemPath;
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-[1000] overflow-hidden" aria-labelledby="drawer-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeDrawer}
            aria-hidden="true"
          />

          {/* Slide-over panel from right */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              ref={drawerRef}
              id="global-nav-drawer"
              className="w-screen max-w-md bg-[#0c1017] border-l border-amber-500/20 shadow-2xl flex flex-col overflow-hidden text-zinc-100 font-sans"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
            >
              {/* Drawer Header */}
              <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between shrink-0">
                <Link to="/" onClick={closeDrawer} className="flex items-center gap-2.5 group" aria-label="EagleBABA Home">
                  <img
                    src="/images/eaglebaba_logo1.png"
                    alt="EagleBABA"
                    className="w-8 h-8 rounded-lg object-contain border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.25)] shrink-0"
                  />
                  <div>
                    <div className="font-extrabold text-sm tracking-wider text-amber-400 group-hover:text-amber-300 font-mono">
                      EagleBABA
                    </div>
                    <div className="text-[10px] text-zinc-400 font-mono tracking-wide">
                      Institutional Navigation Menu
                    </div>
                  </div>
                </Link>

                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-[10px] text-zinc-400 font-mono">
                    ESC
                  </span>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    aria-label="Close navigation menu"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Quick Search */}
              <div className="p-3 border-b border-zinc-800/60 bg-zinc-950/40 shrink-0">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search 20+ terminals & analytics..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 text-xs text-zinc-200 placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500/60 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation Items List */}
              <nav className="flex-1 overflow-y-auto p-4 space-y-6" aria-label="Global Application Navigation">
                {groupedItems.map(([section, items]) => (
                  <div key={section} className="space-y-1.5">
                    <div className="px-2 text-[10px] font-mono font-bold tracking-wider uppercase text-amber-500/80 flex items-center justify-between">
                      <span>{SECTION_LABELS[section] ?? section}</span>
                      <span className="text-zinc-600 font-normal">({items.length})</span>
                    </div>

                    <div className="space-y-1">
                      {items.map((it) => {
                        const Icon = it.icon;
                        const active = isActive(it);

                        const content = (
                          <>
                            <span className={`shrink-0 ${active ? "text-amber-400" : "text-zinc-400 group-hover:text-amber-300"}`}>
                              <Icon size={18} />
                            </span>
                            <span className="flex-1 truncate">{it.label}</span>
                            {it.badge && (
                              <span
                                className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded shrink-0 border"
                                style={{
                                  background: "rgba(245,158,11,0.15)",
                                  color: "#fbbf24",
                                  borderColor: "rgba(245,158,11,0.35)",
                                }}
                              >
                                {it.badge}
                              </span>
                            )}
                          </>
                        );

                        const itemClass = `group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          active
                            ? "bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold shadow-sm shadow-amber-500/10"
                            : "text-zinc-300 hover:text-white hover:bg-zinc-800/60 border border-transparent"
                        }`;

                        return it.to ? (
                          <Link
                            key={it.id}
                            to={it.to}
                            onClick={closeDrawer}
                            className={itemClass}
                            aria-current={active ? "page" : undefined}
                          >
                            {content}
                          </Link>
                        ) : (
                          <a
                            key={it.id}
                            href={it.href}
                            onClick={closeDrawer}
                            className={itemClass}
                          >
                            {content}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {groupedItems.length === 0 && (
                  <div className="py-12 text-center text-zinc-500 font-mono text-xs">
                    No matching workstations found for &quot;{searchQuery}&quot;
                  </div>
                )}
              </nav>

              {/* Drawer Footer */}
              <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60 text-center shrink-0">
                <div className="text-[10px] font-mono text-zinc-500">
                  EagleBABA Proprietary Mathematical Framework
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
