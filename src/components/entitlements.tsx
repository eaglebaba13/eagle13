/**
 * Phase 20.2 — Reusable entitlement UI. Dark + Gold + Glass style, no
 * hardcoded plan names inside consumers.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { hasEntitlement, resolveEffectivePlan, minPlanFor, type UserEntitlementContext } from "@/lib/entitlements";
import type { Capability, PlanId } from "@/lib/plans";
import { PLANS } from "@/lib/plans";
import { USAGE_WARNING_THRESHOLD } from "@/lib/usage-limits";

const badgeStyles: Record<PlanId, string> = {
  free: "border-slate-500/40 text-slate-300 bg-slate-500/10",
  pro: "border-sky-400/40 text-sky-300 bg-sky-500/10",
  professional: "border-amber-400/50 text-amber-300 bg-amber-500/10",
  enterprise: "border-fuchsia-400/50 text-fuchsia-300 bg-fuchsia-500/10",
};

export function PlanBadge({ plan }: { plan: PlanId }) {
  const p = PLANS[plan];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${badgeStyles[plan]}`}
    >
      {p.name}
    </span>
  );
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    trialing: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    past_due: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    canceled: "bg-red-500/10 text-red-300 border-red-500/30",
    expired: "bg-red-500/10 text-red-300 border-red-500/30",
    suspended: "bg-red-500/10 text-red-300 border-red-500/30",
    incomplete: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? map.incomplete}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function TrialCountdown({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft == null) return null;
  const critical = daysLeft <= 3;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        critical ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300"
      }`}
    >
      Trial ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}
    </span>
  );
}

export function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const ratio = limit === 0 ? 1 : Math.min(1, used / limit);
  const warn = ratio >= USAGE_WARNING_THRESHOLD;
  const full = ratio >= 1;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={full ? "text-red-300" : warn ? "text-amber-300" : ""}>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full transition-all ${
            full ? "bg-red-400" : warn ? "bg-amber-400" : "bg-emerald-400"
          }`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function UpgradeBanner({
  ctx,
  reason,
}: {
  ctx: UserEntitlementContext;
  reason?: string;
}) {
  const eff = resolveEffectivePlan(ctx);
  if (eff.planId === "enterprise") return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium text-amber-200">
          {reason ?? "Unlock premium EagleBABA capabilities"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          You're on <PlanBadge plan={eff.planId} />. Upgrade for advanced analytics, replay and risk tools.
        </div>
      </div>
      <Link
        to="/pricing"
        className="rounded-md bg-amber-400/90 hover:bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900"
      >
        View plans
      </Link>
    </div>
  );
}

export function FeatureLock({
  capability,
  ctx,
  title,
  description,
}: {
  capability: Capability;
  ctx: UserEntitlementContext;
  title?: string;
  description?: string;
}) {
  const required = minPlanFor(capability);
  const eff = resolveEffectivePlan(ctx);
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-300">
        ★
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        {title ?? "Premium feature"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
        {description ?? "This feature is available on a higher plan."}
      </p>
      <div className="mt-4 flex items-center justify-center gap-2 text-xs">
        <span className="text-muted-foreground">Current:</span>
        <PlanBadge plan={eff.planId} />
        {required ? (
          <>
            <span className="text-muted-foreground">→ Required:</span>
            <PlanBadge plan={required} />
          </>
        ) : null}
      </div>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link
          to="/pricing"
          className="rounded-md bg-amber-400/90 hover:bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-900"
        >
          Upgrade
        </Link>
        <Link
          to="/"
          className="rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

export function EntitlementGuard({
  capability,
  ctx,
  fallback,
  children,
}: {
  capability: Capability;
  ctx: UserEntitlementContext;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return hasEntitlement(ctx, capability) ? (
    <>{children}</>
  ) : (
    <>{fallback ?? <FeatureLock capability={capability} ctx={ctx} />}</>
  );
}

export function PremiumFeatureDialog({
  open,
  onClose,
  capability,
  ctx,
}: {
  open: boolean;
  onClose: () => void;
  capability: Capability;
  ctx: UserEntitlementContext;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
        <FeatureLock capability={capability} ctx={ctx} title="Upgrade to continue" />
      </div>
    </div>
  );
}