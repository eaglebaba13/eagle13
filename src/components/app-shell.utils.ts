// App shell route-suppression + breadcrumb helpers.
// Split out of `AppShell.tsx` so the shell module only exports components
// (React Fast Refresh). Behavior is unchanged from the original inline code.

import { NAV_REGISTRY } from "@/lib/navigation";

// Routes that render their own sidebar/shell — global shell is suppressed on
// these so we don't double-render the sidebar or break bespoke grid layouts.
const SELF_SHELLED_ROUTES: readonly string[] = [
  "/",
  "/astro",
  "/live-terminal",
  "/live-market-terminal",
  "/live-chart",
  "/live-levels",
  "/option-strategy",
];

// Routes that should NEVER show the shell (pre-auth, embed).
const NO_SHELL_PREFIXES: readonly string[] = ["/auth", "/api", "/.mcp", "/.well-known"];

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
