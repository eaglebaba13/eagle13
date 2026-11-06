// Phase 36 · Global application shell.
//
// Provides a single unified layout for every non-auth, non-self-shelled route:
//   [ AppSidebar ]  |  [ Header: back button + breadcrumb + ProfileMenu ]
//                   |  [ <Outlet /> content ]
//
// This component is presentation-only. It never fetches data, mutates state,
// or touches provider foundations. Routes that already render their own
// `eb-shell` + `<AppSidebar />` layout (astro, live-terminal, live-levels,
// live-market-terminal, option-strategy, and the marketing index route)
// suppress the global shell via `shouldSuppressShell(pathname)`.

import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SoundToggle } from "@/components/SoundToggle";
import { HeaderAlertBell } from "@/components/HeaderAlertBell";
import { NotificationBell } from "@/components/NotificationBell";
import { buildBreadcrumbs } from "@/components/app-shell.utils";
import { useHydrated } from "@/hooks/use-hydrated";
import { EagleLogo } from "@/components/EagleLogo";
import { applyThemeToDOM, getCachedThemeConfig } from "@/lib/theme-manager";
import { getCachedFeatures } from "@/lib/features-client";

import { LiveMarketTickerTape } from "@/components/market/LiveMarketTickerTape";

function AppShellHeader() {
  const router = useRouter();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const crumbs = buildBreadcrumbs(pathname);
  // Hydration-safe: server + first client render both see `false`, then we
  // upgrade to the real history-aware value after mount.
  const hydrated = useHydrated();
  const canGoBack =
    hydrated && typeof window !== "undefined" && window.history.length > 1 && pathname !== "/";

  return (
    <header
      className="sticky top-0 z-30 hidden items-center gap-3 border-b border-zinc-800/80 bg-[#070a0e]/90 px-4 py-2.5 backdrop-blur-md md:flex"
      aria-label="Page header"
    >
      <button
        type="button"
        onClick={() => (canGoBack ? router.history.back() : router.navigate({ to: "/" }))}
        disabled={canGoBack ? false : true}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Go back"
        title="Go back"
      >
        <ChevronLeft size={16} />
      </button>

      <Link to="/" className="flex items-center gap-2 shrink-0 group" aria-label="EagleBABA Home">
        <EagleLogo
          size={28}
          className="w-7 h-7 rounded-lg object-cover border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.2)] group-hover:border-amber-500/60 transition-colors"
        />
        <span className="font-bold text-xs tracking-wider text-amber-400 group-hover:text-amber-300 font-mono hidden xl:inline">
          EagleBABA
        </span>
      </Link>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
        <ol className="flex min-w-0 items-center gap-1 truncate text-sm">
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={`${c.to ?? c.label}-${i}`} className="flex min-w-0 items-center gap-1">
                {i > 0 ? (
                  <ChevronRight
                    size={12}
                    className="shrink-0 text-muted-foreground/50"
                    aria-hidden
                  />
                ) : (
                  <Home size={13} className="shrink-0 text-muted-foreground" aria-hidden />
                )}
                {isLast || !c.to ? (
                  <span
                    className="truncate font-medium text-foreground"
                    aria-current={isLast ? "page" : undefined}
                  >
                    {c.label}
                  </span>
                ) : (
                  <Link to={c.to} className="truncate text-muted-foreground hover:text-foreground">
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SoundToggle />
        <ThemeToggle />
        <NotificationBell />
        <div className="hidden lg:block">
          <HeaderAlertBell />
        </div>
        <ProfileMenu />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const features = getCachedFeatures();

  useEffect(() => {
    // Apply cached or default theme immediately on mount
    applyThemeToDOM(getCachedThemeConfig());
  }, []);

  return (
    <div
      className="flex min-h-screen w-full text-zinc-100 overflow-x-hidden"
      style={{ backgroundColor: "var(--eb-base-bg, #070a0e)" }}
    >
      {/* Ambient background glow */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -15%, var(--eb-glow-color, rgba(245,158,11,0.03)), transparent)",
        }}
      />
      {/* Sidebar: desktop only (lg+). Tablet + mobile use MobileNav drawer. */}
      <div className="relative z-10 hidden lg:flex lg:shrink-0 lg:pl-3 lg:pr-1 lg:py-3">
        <AppSidebar />
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <AppShellHeader />
        {features.tickerTape !== "hide" ? <LiveMarketTickerTape /> : null}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-28 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
