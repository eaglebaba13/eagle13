import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { useEntitlements } from "@/lib/use-entitlements";
import { PlanBadge } from "@/components/entitlements";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — EagleBABA" },
      {
        name: "description",
        content:
          "EagleBABA plans: Free, Pro, Professional and Enterprise trading intelligence tiers on frozen Engine v1.0.",
      },
      { property: "og:title", content: "EagleBABA Pricing" },
      {
        property: "og:description",
        content: "Institutional trading intelligence — pick a plan that scales with you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");
  const { effective } = useEntitlements();

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Institutional trading intelligence
          </h1>
          <p className="mt-2 text-muted-foreground">
            Every plan runs on the frozen EagleBABA Engine v1.0 — deterministic, versioned, transparent.
          </p>
          <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-4 py-1.5 rounded-full transition-colors ${
                  cycle === c ? "bg-amber-400/90 text-slate-900" : "text-muted-foreground"
                }`}
                type="button"
              >
                {c === "monthly" ? "Monthly" : "Annual (save 17%)"}
              </button>
            ))}
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => (
            <PlanCard key={id} id={id} cycle={cycle} current={effective.planId === id} />
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Prices shown are placeholders. Live billing will activate once a payment provider is connected.
        </p>
      </div>
    </div>
  );
}

function PlanCard({
  id,
  cycle,
  current,
}: {
  id: PlanId;
  cycle: "monthly" | "annual";
  current: boolean;
}) {
  const plan = PLANS[id];
  const { isAuthenticated } = useAuth();
  const price = cycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;
  const priceLabel =
    plan.contactSales || price === null
      ? "Custom"
      : price === 0
        ? "Free"
        : `₹${price.toLocaleString("en-IN")}`;

  return (
    <div
      className={`relative rounded-2xl border p-6 flex flex-col ${
        plan.recommended
          ? "border-amber-400/50 bg-amber-500/5"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      {plan.recommended ? (
        <div className="absolute -top-2 right-4 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">
          POPULAR
        </div>
      ) : null}
      {current ? (
        <div className="absolute -top-2 left-4 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-slate-900">
          CURRENT
        </div>
      ) : null}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <PlanBadge plan={id} />
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{priceLabel}</span>
        {typeof price === "number" && price > 0 ? (
          <span className="text-xs text-muted-foreground">
            /{cycle === "monthly" ? "mo" : "yr"}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground min-h-[3rem]">{plan.description}</p>
      <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        {plan.capabilities.slice(0, 8).map((c) => (
          <li key={c} className="flex items-start gap-2">
            <span className="text-amber-300">✓</span>
            <span className="capitalize">{c.replace(/\./g, " • ")}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
        <span>Watchlists: {plan.limits.watchlists}</span>
        <span>Layouts: {plan.limits.layouts}</span>
        <span>Backtests/day: {plan.limits.backtestsPerDay}</span>
        <span>Exports/day: {plan.limits.exportsPerDay}</span>
      </div>
      <div className="mt-6">
        {plan.contactSales ? (
          <a
            href="mailto:sales@eaglebaba.com"
            className="block w-full rounded-md border border-white/15 py-2 text-center text-sm font-medium hover:bg-white/5"
          >
            Contact sales
          </a>
        ) : current ? (
          <Link
            to="/billing"
            className="block w-full rounded-md border border-white/15 py-2 text-center text-sm font-medium hover:bg-white/5"
          >
            Manage billing
          </Link>
        ) : id === "free" ? (
          <Link
            to={isAuthenticated ? "/billing" : "/auth"}
            className="block w-full rounded-md border border-white/15 py-2 text-center text-sm font-medium hover:bg-white/5"
          >
            {isAuthenticated ? "Manage billing" : "Sign in"}
          </Link>
        ) : (
          <div className="space-y-2">
            <Link
              to={isAuthenticated ? "/payment-status" : "/auth"}
              search={
                isAuthenticated
                  ? { plan: id as "pro" | "professional", cycle }
                  : undefined
              }
              className="block w-full rounded-md bg-amber-400/90 hover:bg-amber-400 py-2 text-center text-sm font-semibold text-slate-900"
            >
              Pay via UPI QR
            </Link>
            <p className="text-[10px] text-center text-muted-foreground">
              Manual verification · typical approval within 24 hours · no auto activation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}