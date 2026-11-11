import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { GuestUnlockCard, isAuthErrorMessage } from "@/components/auth/GuestUnlockCard";
import { isGuestSessionActive } from "@/lib/guest-session";

/**
 * Route group for authenticated/research pages.
 * Enforces Zero-Trust auth gating: unauthorized or unauthenticated requests to
 * protected research paths redirect immediately to /login without leaking
 * pre-rendered HTML or API payloads.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const isGuest = isGuestSessionActive();
      const hasSupabaseToken = Object.keys(window.localStorage).some(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      if (!isGuest && !hasSupabaseToken) {
        throw redirect({
          to: "/auth",
        });
      }
    }
  },
  component: () => <Outlet />,
  errorComponent: ({ error, reset }) => {
    if (isAuthErrorMessage(error)) {
      return <GuestUnlockCard onRetry={reset} />;
    }
    const msg = error instanceof Error ? error.message : String(error);
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 text-center">
        <div className="rounded-2xl border border-red-500/20 bg-zinc-950/80 p-6 max-w-md w-full backdrop-blur-md">
          <p className="text-sm text-red-400 font-medium">Workstation Error</p>
          <p className="mt-1 text-xs text-zinc-400 break-words">{msg}</p>
          <button
            onClick={reset}
            className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  },
});

