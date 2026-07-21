// Phase 44 — Global subscription badge shown in the app header.
//
// Reads the current entitlement context (role + subscription snapshot) and
// renders a compact pill: FREE / PRO Trial (N days) / PRO / PROFESSIONAL / ADMIN.

import { Link } from "@tanstack/react-router";
import { useEntitlements } from "@/lib/use-entitlements";

export function SubscriptionBadge() {
  const { ctx, effective, loading } = useEntitlements();

  if (loading || !ctx) return null;

  const isAdmin = ctx.role === "admin";
  const planId = effective.planId;
  const isTrial = effective.isTrial;
  const daysLeft = effective.trialDaysLeft;

  let label: string;
  let tone: string;
  if (isAdmin) {
    label = "ADMIN";
    tone = "border-purple-500/40 bg-purple-500/10 text-purple-500";
  } else if (planId === "free") {
    label = "FREE";
    tone = "border-border bg-muted/40 text-muted-foreground";
  } else if (isTrial) {
    const d = daysLeft ?? 0;
    label = `PRO Trial · ${d}d`;
    tone = "border-amber-500/40 bg-amber-500/10 text-amber-500";
  } else if (planId === "professional") {
    label = "PROFESSIONAL";
    tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  } else if (planId === "enterprise") {
    label = "ENTERPRISE";
    tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  } else {
    label = "PRO";
    tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-500";
  }

  return (
    <Link
      to="/billing"
      title="Manage subscription"
      className={`hidden items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-opacity hover:opacity-80 sm:inline-flex ${tone}`}
    >
      {label}
    </Link>
  );
}