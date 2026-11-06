import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listPlansAdmin,
  savePlanAdmin,
  togglePlanStatusAdmin,
  type SubscriptionPlanItem,
  type PlanFeatures,
} from "@/lib/admin/plan-management.functions";
import { hasPermission } from "@/lib/roles";
import {
  CreditCard,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Sparkles,
  Zap,
  Activity,
  Bot,
  Send,
  LineChart,
  Save,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/plans")({
  head: () => ({ meta: [{ title: "Subscription Plans · Superadmin Console — EagleBABA" }] }),
  component: AdminPlansPage,
});

function AdminPlansPage() {
  const { role, user: currentAuthUser } = useAuth();
  const listPlans = useServerFn(listPlansAdmin);
  const savePlan = useServerFn(savePlanAdmin);
  const toggleStatus = useServerFn(togglePlanStatusAdmin);

  const isSuperadmin =
    role === "superadmin" ||
    currentAuthUser?.email === "lwillshivansh@gmail.com" ||
    currentAuthUser?.email === "dheerajnarula13@gmail.com";
  const hasAdminAccess = hasPermission(role, "admin.console") || isSuperadmin;

  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanItem | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listPlans();
      setPlans(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasAdminAccess) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdminAccess]);

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-red-500/40 bg-red-500/[0.06] p-6 text-sm text-red-300">
          Admin or Superadmin privileges required to manage subscription tiers.
        </div>
      </div>
    );
  }

  const handleToggleActive = async (p: SubscriptionPlanItem) => {
    setErr(null);
    setMsg(null);
    try {
      await toggleStatus({ data: { id: p.id, isActive: !p.isActive } });
      setMsg(`Plan "${p.name}" is now ${!p.isActive ? "Active" : "Inactive"}.`);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await savePlan({ data: editingPlan });
      setMsg(`Saved changes to "${editingPlan.name}". Pricing synced.`);
      setEditingPlan(null);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateFeature = (feature: keyof PlanFeatures, value: boolean) => {
    if (!editingPlan) return;
    setEditingPlan({
      ...editingPlan,
      features: {
        ...editingPlan.features,
        [feature]: value,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-6 overflow-x-hidden">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-white">Subscription Plans</h1>
                  <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30">
                    TIER CONFIGURATOR
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure pricing, billing validity, and feature entitlement flags across all customer tiers.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Alerts */}
        {msg && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{msg}</span>
            <button onClick={() => setMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-4 py-3">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{err}</span>
            <button onClick={() => setErr(null)} className="ml-auto text-rose-400 hover:text-rose-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-5 flex flex-col justify-between transition-all relative ${
                p.isActive
                  ? "border-amber-500/30 bg-zinc-950/80 shadow-lg shadow-black/40"
                  : "border-white/5 bg-zinc-950/40 opacity-70"
              }`}
            >
              {p.badge && (
                <div className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-2.5 py-0.5 text-[10px] font-bold text-slate-950 shadow-md">
                  {p.badge}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white">{p.name}</h3>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                      p.isActive
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                    }`}
                  >
                    {p.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-amber-400">
                    {p.priceInr === 0 ? "Free" : `₹${p.priceInr.toLocaleString("en-IN")}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    / {p.billingCycle === "lifetime" ? "forever" : p.billingCycle === "monthly" ? "month" : "year"}
                  </span>
                </div>

                <div className="mt-1 text-[11px] text-zinc-400">
                  Validity: <strong className="text-zinc-200">{p.validityDays} days</strong>
                </div>

                <p className="mt-3 text-xs text-muted-foreground min-h-[3rem] line-clamp-3">
                  {p.description}
                </p>

                {/* Feature checklist */}
                <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <Activity className={`w-3.5 h-3.5 ${p.features.liveCandles ? "text-amber-400" : "text-zinc-600"}`} />
                    <span className={p.features.liveCandles ? "text-zinc-200" : "text-zinc-500 line-through"}>
                      Live Candlesticks & SSE
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className={`w-3.5 h-3.5 ${p.features.gammaGex ? "text-amber-400" : "text-zinc-600"}`} />
                    <span className={p.features.gammaGex ? "text-zinc-200" : "text-zinc-500 line-through"}>
                      Net Gamma Exposure (GEX)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bot className={`w-3.5 h-3.5 ${p.features.aiAssistant ? "text-amber-400" : "text-zinc-600"}`} />
                    <span className={p.features.aiAssistant ? "text-zinc-200" : "text-zinc-500 line-through"}>
                      AI Market Assistant
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Send className={`w-3.5 h-3.5 ${p.features.telegramDispatch ? "text-amber-400" : "text-zinc-600"}`} />
                    <span className={p.features.telegramDispatch ? "text-zinc-200" : "text-zinc-500 line-through"}>
                      Telegram Alert Dispatch
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className={`w-3.5 h-3.5 ${p.features.astroHarmonics ? "text-amber-400" : "text-zinc-600"}`} />
                    <span className={p.features.astroHarmonics ? "text-zinc-200" : "text-zinc-500 line-through"}>
                      Astro Harmonics & Gann
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <LineChart className={`w-3.5 h-3.5 ${p.features.backtestLab ? "text-amber-400" : "text-zinc-600"}`} />
                    <span className={p.features.backtestLab ? "text-zinc-200" : "text-zinc-500 line-through"}>
                      Backtesting Lab
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleActive(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    p.isActive
                      ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                      : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                  }`}
                >
                  {p.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPlan({ ...p, features: { ...p.features } })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-white border border-white/10 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  Edit Plan
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Modal: Edit Plan */}
        {editingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-xl rounded-2xl border border-amber-500/30 bg-zinc-950 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="absolute right-4 top-4 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 mb-4">
                <Edit2 className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-semibold text-white">Configure Subscription Tier</h3>
              </div>

              <form onSubmit={handleSaveModal} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Plan Name</label>
                    <input
                      type="text"
                      required
                      value={editingPlan.name}
                      onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Badge Text (Optional)</label>
                    <input
                      type="text"
                      value={editingPlan.badge || ""}
                      onChange={(e) => setEditingPlan({ ...editingPlan, badge: e.target.value })}
                      placeholder="e.g. Popular, Save 20%"
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Price (₹ INR)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={editingPlan.priceInr}
                      onChange={(e) => setEditingPlan({ ...editingPlan, priceInr: Number(e.target.value) })}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Billing Cycle</label>
                    <select
                      value={editingPlan.billingCycle}
                      onChange={(e) =>
                        setEditingPlan({
                          ...editingPlan,
                          billingCycle: e.target.value as "monthly" | "annual" | "lifetime",
                        })
                      }
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Validity (Days)</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={editingPlan.validityDays}
                      onChange={(e) => setEditingPlan({ ...editingPlan, validityDays: Number(e.target.value) })}
                      className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={editingPlan.description}
                    onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  />
                </div>

                {/* Feature Toggles */}
                <div>
                  <label className="block text-xs font-medium text-amber-300 mb-2">Entitlement Feature Toggles</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.features.liveCandles}
                        onChange={(e) => updateFeature("liveCandles", e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Live Candles & SSE</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.features.gammaGex}
                        onChange={(e) => updateFeature("gammaGex", e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Net Gamma (GEX)</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.features.aiAssistant}
                        onChange={(e) => updateFeature("aiAssistant", e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                      />
                      <span>AI Market Assistant</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.features.telegramDispatch}
                        onChange={(e) => updateFeature("telegramDispatch", e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Telegram Dispatch</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.features.astroHarmonics}
                        onChange={(e) => updateFeature("astroHarmonics", e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Astro Harmonics</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/60 border border-white/5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editingPlan.features.backtestLab}
                        onChange={(e) => updateFeature("backtestLab", e.target.checked)}
                        className="rounded border-zinc-700 text-amber-500 focus:ring-amber-400"
                      />
                      <span>Backtesting Lab</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingPlan(null)}
                    className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-zinc-400 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Saving..." : "Save Configuration"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
