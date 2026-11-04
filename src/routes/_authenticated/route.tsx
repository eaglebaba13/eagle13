import { createFileRoute, Outlet } from "@tanstack/react-router";
import { GuestUnlockCard, isAuthErrorMessage } from "@/components/auth/GuestUnlockCard";

/**
 * Route group for authenticated/research pages.
 * If any child route throws an unauthorized or authentication error,
 * render the institutional 1-click Guest Unlock Card.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
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

