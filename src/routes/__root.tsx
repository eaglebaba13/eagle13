import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { MobileNav } from "../components/MobileNav";
import { AuthProvider } from "../lib/auth-context";
import { ProfileMenu } from "../components/ProfileMenu";
import { AppShell, shouldSuppressShell } from "../components/AppShell";
import { MigrationAssistant } from "../components/MigrationAssistant";
import { supabase } from "../integrations/supabase/client";
import { Toaster } from "sonner";
import { installBillingAdapter } from "../lib/billing-init";

installBillingAdapter();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EagleBABA | Astro Levels" },
      {
        name: "description",
        content:
          "Live premium trading dashboard with auto-updated Nifty 50 & Bank Nifty previous working day OHLC, CPR, pivot and Gann levels.",
      },
      { name: "author", content: "EagleBABA" },
      { property: "og:title", content: "EagleBABA | Astro Levels" },
      {
        property: "og:description",
        content:
          "Auto-updated Nifty 50 & Bank Nifty previous-day Close, High, Low with CPR, pivots and Gann zones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "EagleBABA | Astro Levels" },
      { name: "description", content: "Astro Auto Dashboard provides Nifty & BankNifty trading levels, automatically updating with previous day's OHLC data." },
      { property: "og:description", content: "Astro Auto Dashboard provides Nifty & BankNifty trading levels, automatically updating with previous day's OHLC data." },
      { name: "twitter:description", content: "Astro Auto Dashboard provides Nifty & BankNifty trading levels, automatically updating with previous day's OHLC data." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/ov6XDzOo9wOdqnM6be7Xm0tP4mU2/social-images/social-1782990713478-bg_wallpaper.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/ov6XDzOo9wOdqnM6be7Xm0tP4mU2/social-images/social-1782990713478-bg_wallpaper.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const suppressShell = shouldSuppressShell(pathname);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  // Phase 36.1 — Global provider-error safety net.
  // Non-critical background provider failures (Yahoo Finance HTTP 4xx/5xx,
  // aborted server-fn calls after unmount, transient CORS blips) must never
  // reach the Vite dev overlay or the app-level error boundary. They are
  // still forwarded to Lovable error reporting so diagnostics are preserved.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const PROVIDER_HINTS = [
      "Data source error",
      "Request failed for",
      "Invalid JSON from",
      "query1.finance.yahoo.com",
      "query2.finance.yahoo.com",
      "AbortError",
      "The user aborted a request",
    ];
    const isNonCriticalProviderError = (reason: unknown): boolean => {
      const msg =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      if (!msg) return false;
      return PROVIDER_HINTS.some((h) => msg.includes(h));
    };
    const handler = (ev: PromiseRejectionEvent) => {
      if (!isNonCriticalProviderError(ev.reason)) return;
      // Report diagnostics but swallow the overlay.
      try {
        reportLovableError(
          ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason)),
          { boundary: "background_provider_rejection" },
        );
      } catch {
        /* best-effort */
      }
      ev.preventDefault();
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Global mobile navigation: sticky hamburger bar, slide drawer, bottom nav. */}
        <MobileNav />
        {suppressShell ? (
          <>
            {/* Legacy floating profile menu for self-shelled routes (astro, live-*, option-strategy)
                and pre-auth pages. Global AppShell renders it inside its header otherwise. */}
            <div className="fixed top-3 right-3 z-40">
              <ProfileMenu />
            </div>
            <Outlet />
          </>
        ) : (
          <AppShell>
            <Outlet />
          </AppShell>
        )}
        <MigrationAssistant />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
