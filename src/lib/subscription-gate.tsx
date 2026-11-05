/**
 * Tier Gating & Quota Middleware.
 * Provides client and server-side subscription guards and the Cyber-Obsidian
 * "Upgrade to Pro" component for premium intelligence routes.
 */
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles, Shield, ArrowRight } from "lucide-react";
import type { AppRole } from "./roles";

export interface SubscriptionCheck {
  allowed: boolean;
  currentPlan: string;
  isExpired: boolean;
  requiredPlans: string[];
}

export function checkSubscriptionAccess(
  userRole: AppRole | null | undefined,
  userPlanId: string | null | undefined,
  planExpiresAt: string | null | undefined,
  allowedPlans: string[] = ["pro", "professional", "enterprise", "institutional"],
): SubscriptionCheck {
  // Superadmin and Admin always bypass tier gates
  if (userRole === "superadmin" || userRole === "admin" || userRole === "enterprise") {
    return {
      allowed: true,
      currentPlan: "enterprise",
      isExpired: false,
      requiredPlans: allowedPlans,
    };
  }

  const currentPlan = (userPlanId || "free").toLowerCase();

  // Expiration check
  if (planExpiresAt) {
    const exp = new Date(planExpiresAt).getTime();
    if (!isNaN(exp) && exp < Date.now()) {
      return {
        allowed: false,
        currentPlan,
        isExpired: true,
        requiredPlans: allowedPlans,
      };
    }
  }

  const normalizedAllowed = allowedPlans.map((p) => p.toLowerCase());
  const isMatch = normalizedAllowed.some((allowed) => currentPlan.includes(allowed));

  return {
    allowed: isMatch,
    currentPlan,
    isExpired: false,
    requiredPlans: allowedPlans,
  };
}

export interface UpgradeCardProps {
  featureTitle?: string;
  featureDescription?: string;
  requiredTier?: string;
}

export function CyberUpgradeCard({
  featureTitle = "Institutional Intelligence",
  featureDescription = "This quantitative engine requires an active Pro or Institutional tier subscription.",
  requiredTier = "Pro",
}: UpgradeCardProps) {
  return (
    <div className="relative rounded-2xl border border-amber-500/30 bg-zinc-950/90 p-8 shadow-2xl backdrop-blur-md overflow-hidden text-center max-w-lg mx-auto my-8">
      {/* Glow effect */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border border-amber-400/40 text-amber-400 mb-4 shadow-lg shadow-amber-500/10">
          <Lock className="w-7 h-7" />
        </div>

        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
          TIER RESTRICTED · {requiredTier.toUpperCase()} REQUIRED
        </span>

        <h3 className="text-xl font-bold text-white mt-3">{featureTitle}</h3>
        <p className="text-xs text-muted-foreground mt-2 max-w-sm leading-relaxed">
          {featureDescription}
        </p>

        <div className="w-full my-6 p-3.5 rounded-xl bg-zinc-900/60 border border-white/5 text-left text-xs space-y-2">
          <div className="flex items-center gap-2 text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Sub-second live streaming candles & Gann pivots</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Net Gamma Exposure (GEX) & Option Chain matrix</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Automated Telegram notifications & morning briefs</span>
          </div>
        </div>

        <Link
          to="/pricing/manual-checkout"
          search={{ plan: "pro", cycle: "monthly" }}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all"
        >
          Upgrade to {requiredTier}
          <ArrowRight className="w-4 h-4" />
        </Link>

        <Link to="/pricing" className="mt-3 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
          View all plans & comparison table →
        </Link>
      </div>
    </div>
  );
}
