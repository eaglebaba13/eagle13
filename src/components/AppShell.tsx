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
import { type ReactNode } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SoundToggle } from "@/components/SoundToggle";
import { HeaderAlertBell } from "@/components/HeaderAlertBell";
import { NotificationBell } from "@/components/NotificationBell";
import { buildBreadcrumbs } from "@/components/app-shell.utils";
import { useHydrated } from "@/hooks/use-hydrated";

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
      className="sticky top-0 z-30 hidden items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:flex"
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
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar: desktop only (lg+). Tablet + mobile use MobileNav drawer. */}
      <div className="hidden lg:flex lg:shrink-0 lg:pl-3 lg:pr-1 lg:py-3">
        <AppSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppShellHeader />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
