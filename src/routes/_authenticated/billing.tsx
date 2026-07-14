import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEntitlements } from "@/lib/use-entitlements";
import { getBillingAdapter, type Invoice } from "@/lib/billing-adapter";
import { PlanBadge, SubscriptionStatusBadge, TrialCountdown } from "@/components/entitlements";
import { useAuth } from "@/lib/auth-context";

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

  useEffect(() => {
    if (!user) return;
    void adapter.getInvoices(user.id).then(setInvoices);
  }, [user, adapter]);

  const isDev = import.meta.env.DEV;

  const startTrial = async (plan: "pro" | "professional") => {
    if (!user) return;
    const trialEnd = new Date(Date.now() + 14 * 86_400_000).toISOString();
    await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan,
          status: "trialing",
          trial_end: trialEnd,
        } as never,
        { onConflict: "user_id" },
      );
    await supabase
      .from("audit_log")
      .insert({ user_id: user.id, event: "trial.started", metadata: { plan } as never });
    await refresh();
    setMsg(`Trial started on ${plan}. Ends ${new Date(trialEnd).toLocaleDateString()}.`);
  };

  const cancel = async () => {
    if (!user) return;
    await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true } as never)
      .eq("user_id", user.id);
    await supabase
      .from("audit_log")
      .insert({ user_id: user.id, event: "subscription.canceled", metadata: {} as never });
    await refresh();
    setMsg("Cancellation scheduled at period end.");
  };

  const resume = async () => {
    if (!user) return;
    await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: false } as never)
      .eq("user_id", user.id);
    await supabase
      .from("audit_log")
      .insert({ user_id: user.id, event: "subscription.resumed", metadata: {} as never });
    await refresh();
    setMsg("Subscription resumed.");
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
          {adapter.configured ? (
            <p className="text-sm text-muted-foreground">
              Connected to <span className="text-foreground">{adapter.name}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Billing provider not configured.{" "}
              {isDev && "Development mock actions are available below."}
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