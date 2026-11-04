import React from "react";
import { Link } from "@tanstack/react-router";
import { Lock, LogIn, Sparkles, RefreshCw } from "lucide-react";
import { enableGuestSession } from "@/lib/guest-session";
import { toast } from "sonner";

export interface GuestUnlockCardProps {
  title?: string;
  description?: string;
  resourceName?: string;
  onRetry?: () => void;
  className?: string;
}

export function GuestUnlockCard({
  title,
  description,
  resourceName,
  onRetry,
  className = "",
}: GuestUnlockCardProps) {
  const cardTitle = title || (resourceName ? `${resourceName} Access` : "Authentication Required");
  const cardDesc =
    description ||
    (resourceName
      ? `${resourceName} requires an active session. Sign in with your research account or continue immediately with guest full access.`
      : "This research workstation requires an active session. Sign in or continue immediately with guest full access.");

  const handleGuestUnlock = () => {
    enableGuestSession();
    toast.success("Guest full access enabled");
    window.location.reload();
  };

  return (
    <div className={`min-h-[60vh] flex items-center justify-center p-6 ${className}`}>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-8 text-center max-w-md w-full shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-amber-500/30">
        <div className="absolute -top-16 -left-16 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 h-36 w-36 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

        <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mb-5 shadow-inner">
          <Lock size={26} className="text-amber-400" />
        </div>

        <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
          {cardTitle}
        </h2>

        <p className="mt-2.5 text-sm text-zinc-400 leading-relaxed">
          {cardDesc}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-110 active:scale-95"
          >
            <LogIn size={16} />
            Sign In
          </Link>
          <button
            type="button"
            onClick={handleGuestUnlock}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/80 px-5 py-2.5 text-sm font-medium text-zinc-200 shadow-sm transition-all hover:bg-zinc-800 hover:border-zinc-600 active:scale-95"
          >
            <Sparkles size={16} className="text-amber-400 animate-pulse" />
            Continue as Guest
          </button>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-200 hover:bg-zinc-900"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span>Institutional Research Mode · Read-Only Sandbox</span>
        </div>
      </div>
    </div>
  );
}

export function isAuthErrorMessage(error: unknown): boolean {
  if (!error) return false;
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("unauthorized") ||
    msg.includes("authentication required") ||
    msg.includes("authorization header") ||
    msg.includes("not authenticated") ||
    msg.includes("jwt")
  );
}
