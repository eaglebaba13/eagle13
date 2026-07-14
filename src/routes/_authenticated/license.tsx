import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { buildLicenseView, type SubscriptionRow } from "@/lib/license";
import { ENGINE_VERSION } from "@/lib/engine-version";
import { useEntitlements } from "@/lib/use-entitlements";
import { PlanBadge, SubscriptionStatusBadge, UsageMeter } from "@/components/entitlements";
import { getBillingAdapter } from "@/lib/billing-adapter";

export const Route = createFileRoute("/_authenticated/license")({
  head: () => ({ meta: [{ title: "License — EagleBABA" }] }),
  component: LicensePage,
});

function LicensePage() {
  const { user, role } = useAuth();
  const { effective } = useEntitlements();
  const adapter = getBillingAdapter();
  const [row, setRow] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const existing = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing.data) {
        setRow(existing.data as unknown as SubscriptionRow);
      } else {
        // Auto-provision a free-tier subscription with a generated license key.
        const { data } = await supabase
          .from("subscriptions")
          .insert({ user_id: user.id })
          .select("*")
          .maybeSingle();
        if (data) setRow(data as unknown as SubscriptionRow);
      }
      setLoading(false);
    })();
  }, [user]);

  const view = buildLicenseView(row, role);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">License</h1>
          <p className="text-sm text-muted-foreground">
            Your current plan, license key and the exact calculation engine that produced your results.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-6 grid grid-cols-2 md:grid-cols-3 gap-6">
          <Stat label="Current plan" value={view.planLabel} />
          <Stat label="Status" value={<Badge status={view.status} />} />
          <Stat label="Days remaining" value={view.daysRemaining === null ? "Unlimited" : `${view.daysRemaining}`} />
          <Stat
            label="License key"
            value={<span className="font-mono text-xs">{view.licenseKey}</span>}
          />
          <Stat label="Activated" value={view.activatedAt.toLocaleDateString()} />
          <Stat
            label="Expires"
            value={view.expiresAt ? view.expiresAt.toLocaleDateString() : "—"}
          />
        </section>

        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Subscription
            </h2>
            <div className="flex items-center gap-2">
              <PlanBadge plan={effective.planId} />
              <SubscriptionStatusBadge status={effective.status} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <UsageMeter label="Watchlists" used={0} limit={effective.plan.limits.watchlists} />
            <UsageMeter label="Layouts" used={0} limit={effective.plan.limits.layouts} />
            <UsageMeter label="Backtests / day" used={0} limit={effective.plan.limits.backtestsPerDay} />
            <UsageMeter label="Exports / day" used={0} limit={effective.plan.limits.exportsPerDay} />
          </div>
          <div className="text-xs text-muted-foreground">
            Billing provider:{" "}
            {effective.provider === "manual_upi"
              ? "MANUAL UPI"
              : adapter.configured
                ? adapter.name
                : "not configured"}{" "}
            · Renews: {effective.renewsAt ? effective.renewsAt.toLocaleDateString() : "—"}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Engine versions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {(Object.entries(ENGINE_VERSION) as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="capitalize text-muted-foreground">{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            EagleBABA Engine v1.0 is frozen and deterministic. Every backtest, replay, decision and
            risk calculation on your account uses these exact versions.
          </p>
        </section>

        {loading && (
          <p className="text-sm text-muted-foreground">Loading license…</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-medium">{value}</div>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-500",
    trial: "bg-amber-500/10 text-amber-500",
    expired: "bg-red-500/10 text-red-500",
    inactive: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? map.inactive}`}>
      {status}
    </span>
  );
}