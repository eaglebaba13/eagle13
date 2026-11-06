import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/roles";
import {
  getSiteFeaturesAdmin,
  saveSiteFeaturesAdmin,
  resetSiteFeaturesAdmin,
  DEFAULT_FEATURES_CONFIG,
  type SiteFeaturesConfig,
} from "@/lib/admin/features-manager.functions";
import { setCachedFeatures } from "@/lib/features-client";
import {
  Sliders,
  Save,
  RotateCcw,
  Activity,
  Layers,
  Radio,
  Brain,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Globe,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/features")({
  head: () => ({ meta: [{ title: "Site Features · Superadmin Console — EagleBABA" }] }),
  component: AdminFeaturesPage,
});

function AdminFeaturesPage() {
  const { role, user: currentAuthUser } = useAuth();
  const getFeatures = useServerFn(getSiteFeaturesAdmin);
  const saveFeatures = useServerFn(saveSiteFeaturesAdmin);
  const resetFeatures = useServerFn(resetSiteFeaturesAdmin);

  const isSuperadmin =
    role === "superadmin" || currentAuthUser?.email === "lwillshivansh@gmail.com";
  const hasAccess = isSuperadmin || hasPermission(role, "admin.console");

  const [features, setFeatures] = useState<SiteFeaturesConfig>(DEFAULT_FEATURES_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getFeatures()
      .then((data) => {
        if (mounted && data) {
          setFeatures(data);
          setCachedFeatures(data);
        }
      })
      .catch((e) => {
        if (mounted) setErr((e as Error).message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [getFeatures]);

  if (!hasAccess) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="card-institutional p-8 inline-block max-w-md">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-zinc-100">Superadmin Access Required</h2>
          <p className="text-sm text-zinc-400 mt-2">
            Site Feature Visibility controls are restricted to Superadmin operators. Please switch
            to an authorized administrative session.
          </p>
        </div>
      </div>
    );
  }

  const handleUpdate = <K extends keyof SiteFeaturesConfig>(
    key: K,
    val: SiteFeaturesConfig[K],
  ) => {
    setFeatures((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await saveFeatures({ data: features });
      if (res.success) {
        setFeatures(res.config);
        setCachedFeatures(res.config);
        setMsg("Site feature visibility settings saved and applied globally!");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all feature visibility flags back to platform defaults?")) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await resetFeatures();
      if (res.success) {
        setFeatures(res.config);
        setCachedFeatures(res.config);
        setMsg("Feature flags reset to platform defaults!");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Site Content & Feature Visibility
            </h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Superadmin
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Dynamically toggle and gate high-impact platform features, streaming endpoints, and
            institutional intelligence modules.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors shadow-[0_0_12px_rgba(245,158,11,0.3)] disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Feature Flags"}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {msg && (
        <div className="card-institutional p-3 flex items-center gap-2 text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{msg}</span>
        </div>
      )}
      {err && (
        <div className="card-institutional p-3 flex items-center gap-2 text-xs text-rose-400 border-rose-500/30 bg-rose-500/10">
          <AlertCircle size={16} className="shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Feature Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Ticker Tape */}
        <div className="card-institutional p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Activity size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">
                  Live Market Ticker Tape
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  features.tickerTape === "show"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {features.tickerTape.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Top horizontal ticker tape running NIFTY, BANKNIFTY, SENSEX, and INDIA VIX sub-second
              ticks across page headers.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => handleUpdate("tickerTape", "show")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.tickerTape === "show"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Eye size={13} />
              <span>Visible</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdate("tickerTape", "hide")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.tickerTape === "hide"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <EyeOff size={13} />
              <span>Hidden</span>
            </button>
          </div>
        </div>

        {/* 2. Hero Carousel */}
        <div className="card-institutional p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Sparkles size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">
                  Astro Regime Hero Carousel
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  features.heroCarousel === "show"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {features.heroCarousel.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Top carousel showcase displaying planetary harmonics, active market regimes, and
              Gann timing summaries on dashboard routes.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => handleUpdate("heroCarousel", "show")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.heroCarousel === "show"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Eye size={13} />
              <span>Visible</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdate("heroCarousel", "hide")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.heroCarousel === "hide"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <EyeOff size={13} />
              <span>Hidden</span>
            </button>
          </div>
        </div>

        {/* 3. Astro Reversal Window */}
        <div className="card-institutional p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Radio size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">
                  Astro Reversal Window Banner
                </h3>
              </div>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  features.astroReversalWindow === "show"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {features.astroReversalWindow.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              High-priority reversal countdown timer and planetary angle cluster notices on Astro
              Levels and Market Terminal pages.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => handleUpdate("astroReversalWindow", "show")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.astroReversalWindow === "show"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Eye size={13} />
              <span>Visible</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdate("astroReversalWindow", "hide")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.astroReversalWindow === "hide"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <EyeOff size={13} />
              <span>Hidden</span>
            </button>
          </div>
        </div>

        {/* 4. Decision Intelligence Center */}
        <div className="card-institutional p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Brain size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">
                  Decision Intelligence Center
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                {features.decisionIntelligence.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Institutional quantitative signal dashboard (`/decision`) combining Gann angles,
              Astro transits, and derivatives flow.
            </p>
          </div>

          <div className="flex items-center gap-1.5 pt-3 border-t border-zinc-800/60">
            {(
              [
                { val: "public", label: "Public", icon: Globe },
                { val: "pro_only", label: "Pro Only", icon: Lock },
                { val: "hidden", label: "Hidden", icon: EyeOff },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const isSel = features.decisionIntelligence === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleUpdate("decisionIntelligence", opt.val)}
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono font-semibold flex items-center justify-center gap-1 transition-colors ${
                    isSel
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Icon size={12} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Live Candlestick SSE Stream */}
        <div className="card-institutional p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Radio size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">
                  Live Candlestick SSE Feed
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                {features.liveCandlesSse.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Sub-second Upstox V3 streaming candle provider (`/api/live-candles`) delivering 1m,
              3m, 5m bars.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => handleUpdate("liveCandlesSse", "public")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.liveCandlesSse === "public"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Globe size={13} />
              <span>Public Access</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdate("liveCandlesSse", "pro_only")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.liveCandlesSse === "pro_only"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Lock size={13} />
              <span>Pro Only</span>
            </button>
          </div>
        </div>

        {/* 6. Option Chain Derivatives Heatmap */}
        <div className="card-institutional p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <Layers size={18} />
                <h3 className="text-sm font-bold text-zinc-100 font-sans">
                  Option Chain Heatmap & GEX
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                {features.optionChainHeatmap.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Live Net Gamma Exposure (GEX), Put-Call Ratio (PCR), and Max Pain visualization matrix
              for NIFTY, BANKNIFTY, and SENSEX.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={() => handleUpdate("optionChainHeatmap", "public")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.optionChainHeatmap === "public"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Globe size={13} />
              <span>Public Access</span>
            </button>
            <button
              type="button"
              onClick={() => handleUpdate("optionChainHeatmap", "pro_only")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                features.optionChainHeatmap === "pro_only"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Lock size={13} />
              <span>Pro Only</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
