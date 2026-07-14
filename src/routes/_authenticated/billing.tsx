import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useEntitlements } from "@/lib/use-entitlements";
import { getBillingAdapter, type Invoice } from "@/lib/billing-adapter";
import { PlanBadge, SubscriptionStatusBadge, TrialCountdown } from "@/components/entitlements";
import { useAuth } from "@/lib/auth-context";
import {
  selfStartTrial,
  selfSetCancelAtPeriodEnd,
} from "@/lib/billing-rpc";
import { getBillingProviderHealth } from "@/lib/razorpay-checkout.functions";
import type { BillingProviderHealth } from "@/lib/razorpay-plan-map";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Billing — EagleBABA" }] }),
  component: BillingPage,
});

function BillingPage() {
  const { user } = useAuth();
  const { effective, refresh } = useEntitlements();
  const adapter = getBillingAdapter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [health, setHealth] = useState<BillingProviderHealth | null>(null);

  useEffect(() => {
    if (!user) return;
    void adapter.getInvoices(user.id).then(setInvoices);
    void getBillingProviderHealth().then(setHealth).catch(() => setHealth(null));
  }, [user, adapter]);

  const isDev = import.meta.env.DEV;

  const startTrial = async (plan: "pro" | "professional") => {
    if (!user) return;
    try {
      await selfStartTrial(plan);
      await refresh();
      setMsg(`Trial started on ${plan}.`);
    } catch (e) {
      setMsg(`Could not start trial: ${(e as Error).message}`);
    }
  };

  const cancel = async () => {
    if (!user) return;
    try {
      await selfSetCancelAtPeriodEnd(true);
      await refresh();
      setMsg("Cancellation scheduled at period end.");
    } catch (e) {
      setMsg(`Could not cancel: ${(e as Error).message}`);
    }
  };

  const resume = async () => {
    if (!user) return;
    try {
      await selfSetCancelAtPeriodEnd(false);
      await refresh();
      setMsg("Subscription resumed.");
    } catch (e) {
      setMsg(`Could not resume: ${(e as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your plan, trial, renewal and payment methods.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-6 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <PlanBadge plan={effective.planId} />
                <SubscriptionStatusBadge status={effective.status} />
                {effective.isTrial && <TrialCountdown daysLeft={effective.trialDaysLeft} />}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>Renews: {effective.renewsAt ? effective.renewsAt.toLocaleDateString() : "—"}</div>
              <div>Cancel at period end: {effective.cancelAtPeriodEnd ? "Yes" : "No"}</div>
              <div>Provider: {effective.provider ?? "not configured"}</div>
            </div>
          </div>
          {msg && (
            <div className="rounded-md bg-emerald-500/10 text-emerald-300 text-xs px-3 py-2">{msg}</div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Billing provider
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Provider: <span className="text-foreground capitalize">{adapter.name}</span>
            </span>
            <EnvironmentBadge env={health?.environment ?? "not_configured"} />
            {health && !health.configured && (
              <span className="text-amber-300">— Razorpay credentials not configured.</span>
            )}
            {health && health.configured && !health.webhookConfigured && (
              <span className="text-amber-300">— Webhook secret missing.</span>
            )}
          </div>
          {health && health.slots.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
              {health.slots.map((s) => (
                <li key={`${s.plan}_${s.cycle}`} className="flex items-center gap-2">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      s.configured ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <span className="capitalize">
                    {s.plan} · {s.cycle}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isDev && (
            <p className="mt-3 text-xs text-muted-foreground">
              Development mock actions available below.
            </p>
          )}
          {isDev && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => startTrial("pro")}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                Start Pro trial (dev)
              </button>
              <button
                type="button"
                onClick={() => startTrial("professional")}
                className="rounded-md border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                Start Professional trial (dev)
              </button>
              {effective.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  onClick={resume}
                  className="rounded-md bg-emerald-500/80 px-3 py-1.5 text-xs font-medium text-slate-900"
                >
                  Resume subscription
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-md border border-red-500/40 text-red-300 px-3 py-1.5 text-xs hover:bg-red-500/10"
                >
                  Cancel at period end
                </button>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Invoices
          </h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {invoices.map((inv) => (
                <li key={inv.id} className="py-2 flex justify-between">
                  <span>{inv.issuedAt.toLocaleDateString()}</span>
                  <span>
                    {(inv.amountInPaise / 100).toLocaleString("en-IN", {
                      style: "currency",
                      currency: inv.currency,
                    })}
                  </span>
                  <span className="capitalize text-muted-foreground">{inv.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}