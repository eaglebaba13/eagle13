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
import { NAV_REGISTRY } from "@/lib/navigation";

// Routes that render their own sidebar/shell — global shell is suppressed on
// these so we don't double-render the sidebar or break bespoke grid layouts.
const SELF_SHELLED_ROUTES: readonly string[] = [
  "/",
  "/astro",
  "/live-terminal",
  "/live-market-terminal",
  "/live-levels",
  "/option-strategy",
];

// Routes that should NEVER show the shell (pre-auth, embed).
const NO_SHELL_PREFIXES: readonly string[] = [
  "/auth",
  "/api",
  "/.mcp",
  "/.well-known",
];

export function shouldSuppressShell(pathname: string): boolean {
  if (!pathname) return true;
  if (NO_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (SELF_SHELLED_ROUTES.includes(pathname)) return true;
  return false;
}

export interface Crumb {
  readonly label: string;
  readonly to?: string;
}

function prettifySegment(seg: string): string {
  const cleaned = seg.replace(/[-_]+/g, " ").trim();
  if (!cleaned) return seg;
  return cleaned
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function buildBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Home", to: "/" }];
  if (!pathname || pathname === "/") return crumbs;
  const segments = pathname.split("/").filter(Boolean);
  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    const nav = NAV_REGISTRY.find((n) => n.to === acc);
    const label = nav?.label ?? prettifySegment(seg);
    crumbs.push({ label, to: acc });
  }
  return crumbs;
}

function AppShellHeader() {
  const router = useRouter();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const crumbs = buildBreadcrumbs(pathname);
  const canGoBack =
    typeof window !== "undefined" && window.history.length > 1 && pathname !== "/";

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Page header"
    >
      <button
        type="button"
        onClick={() => (canGoBack ? router.history.back() : router.navigate({ to: "/" }))}
        disabled={!canGoBack}
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
                  <ChevronRight size={12} className="shrink-0 text-muted-foreground/50" aria-hidden />
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
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar: hidden below md via existing .eb-sidebar rule in styles.css. */}
      <div className="hidden md:flex md:shrink-0 md:pl-3 md:pr-1 md:py-3">
        <AppSidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppShellHeader />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}