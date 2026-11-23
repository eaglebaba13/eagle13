import { Link, useRouterState } from "@tanstack/react-router";
import { Menu as MenuIcon } from "lucide-react";
import { EagleLogo } from "@/components/EagleLogo";
import { mobileBottomNav } from "@/lib/navigation";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FontSizeControl } from "@/components/FontSizeControl";
import { useNavDrawer } from "@/context/nav-drawer-context";

export function MobileNav() {
  const { openDrawer, isOpen } = useNavDrawer();
  const path = useRouterState({ select: (r) => r.location.pathname });

  // Suppress workstation mobile nav on public landing page and auth flows
  if (path === "/" || path === "/auth" || path?.startsWith("/auth/")) {
    return null;
  }

  return (
    <>
      {/* Sticky mobile top bar: brand on left, controls and hamburger menu on right */}
      <header className="eb-mtopbar eb-glass block md:hidden" role="banner">
        <Link to="/" className="eb-mtopbar-brand" aria-label="EagleBABA home">
          <EagleLogo size={28} className="rounded-lg object-contain" />
          <span>EagleBABA</span>
        </Link>
        <div className="eb-mtopbar-actions">
          <FontSizeControl />
          <ThemeToggle />
          <NotificationBell />
          <ProfileMenu />
          <button
            type="button"
            className="eb-burger"
            aria-label="Open navigation menu"
            aria-expanded={isOpen}
            aria-controls="global-nav-drawer"
            onClick={openDrawer}
          >
            <MenuIcon size={20} />
          </button>
        </div>
      </header>

      {/* Bottom navigation: solid obsidian black background with luxury gold accent */}
      <nav
        className="eb-mbottomnav fixed bottom-3 inset-x-0 mx-auto z-50 block md:hidden max-w-sm bg-[#0b0f17] border border-amber-500/35 rounded-[20px] shadow-[0_10px_35px_rgba(0,0,0,0.95)] shadow-amber-500/10 backdrop-blur-xl"
        style={{ backgroundColor: "#0b0f17", opacity: 1 }}
        aria-label="Quick navigation"
      >
        {mobileBottomNav().map((it) => {
          const Icon = it.icon;
          const active = it.to ? path === it.to : false;
          return (
            <Link
              key={it.id}
              to={it.to!}
              className={`eb-mbn-item${
                active
                  ? " is-active bg-amber-500/20 border border-amber-500/50 text-amber-300 font-semibold"
                  : " text-zinc-400 font-medium hover:text-zinc-200"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={21} className={active ? "text-amber-300" : "text-zinc-400"} />
              <span className={active ? "text-amber-300 font-semibold" : "text-zinc-400 font-medium"}>
                {it.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          className="eb-mbn-item text-zinc-400 font-medium hover:text-zinc-200"
          aria-label="Open menu"
          onClick={openDrawer}
        >
          <MenuIcon size={21} className="text-zinc-400" />
          <span className="text-zinc-400 font-medium">Menu</span>
        </button>
      </nav>
    </>
  );
}
