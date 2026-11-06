import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/roles";
import {
  getThemeConfigAdmin,
  saveThemeConfigAdmin,
  resetThemeConfigAdmin,
  THEME_PRESETS,
  DEFAULT_THEME_CONFIG,
  type ThemeStudioConfig,
  type ThemePreset,
} from "@/lib/admin/theme-studio.functions";
import { applyThemeToDOM, setCachedThemeConfig, hexToRgba } from "@/lib/theme-manager";
import {
  Palette,
  Sparkles,
  Save,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Sliders,
  ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/theme")({
  head: () => ({ meta: [{ title: "Theme Studio · Superadmin Console — EagleBABA" }] }),
  component: AdminThemeStudioPage,
});

function AdminThemeStudioPage() {
  const { role, user: currentAuthUser } = useAuth();
  const getTheme = useServerFn(getThemeConfigAdmin);
  const saveTheme = useServerFn(saveThemeConfigAdmin);
  const resetTheme = useServerFn(resetThemeConfigAdmin);

  const isSuperadmin =
    role === "superadmin" || currentAuthUser?.email === "lwillshivansh@gmail.com";
  const hasAccess = isSuperadmin || hasPermission(role, "admin.console");

  const [config, setConfig] = useState<ThemeStudioConfig>(DEFAULT_THEME_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getTheme()
      .then((cfg) => {
        if (mounted && cfg) {
          setConfig(cfg);
          applyThemeToDOM(cfg);
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
  }, [getTheme]);

  if (!hasAccess) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="card-institutional p-8 inline-block max-w-md">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-zinc-100">Superadmin Access Required</h2>
          <p className="text-sm text-zinc-400 mt-2">
            The Live Theme Studio is restricted to Superadmin operators. Please switch to an
            authorized administrative session.
          </p>
        </div>
      </div>
    );
  }

  const handlePresetSelect = (presetKey: Exclude<ThemePreset, "custom">) => {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) return;
    const updated: ThemeStudioConfig = { ...preset };
    setConfig(updated);
    applyThemeToDOM(updated);
    setCachedThemeConfig(updated);
    setMsg(`Preset applied: ${presetKey.replace("-", " ").toUpperCase()}`);
    setTimeout(() => setMsg(null), 3000);
  };

  const handleFieldChange = <K extends keyof ThemeStudioConfig>(
    key: K,
    val: ThemeStudioConfig[K],
  ) => {
    const updated: ThemeStudioConfig = {
      ...config,
      [key]: val,
      preset: "custom",
    };
    setConfig(updated);
    applyThemeToDOM(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await saveTheme({ data: config });
      if (res.success) {
        setConfig(res.config);
        applyThemeToDOM(res.config);
        setCachedThemeConfig(res.config);
        setMsg("Theme saved and applied globally across EagleBABA!");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 4000);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset theme back to canonical Obsidian-Gold defaults?")) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await resetTheme();
      if (res.success) {
        setConfig(res.config);
        applyThemeToDOM(res.config);
        setCachedThemeConfig(res.config);
        setMsg("Theme reset to Obsidian-Gold defaults!");
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
            <Palette className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Live Theme Studio
            </h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Superadmin
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time visual theming: tweak background obsidian hues, card glass opacity, border glows,
            and accent tokens globally across all devices.
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
            {saving ? "Saving..." : "Save & Apply Globally"}
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

      {/* Presets Bar */}
      <div className="card-institutional p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-mono uppercase text-zinc-400">
          <Sparkles size={14} className="text-amber-400" />
          <span>Instant Presets</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {(
            [
              { key: "obsidian-gold", label: "Obsidian Gold", desc: "Luxury Cyber Gold", color: "#f59e0b" },
              { key: "cyber-cyan", label: "Cyber Cyan", desc: "Neon Terminal Cyan", color: "#06b6d4" },
              { key: "emerald-matrix", label: "Emerald Matrix", desc: "Institutional Green", color: "#10b981" },
              { key: "royal-violet", label: "Royal Violet", desc: "Deep Amethyst", color: "#a855f7" },
              { key: "pure-black", label: "Pure Black OLED", desc: "Zero Emissive Black", color: "#fbbf24" },
            ] as const
          ).map((p) => {
            const isSelected = config.preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePresetSelect(p.key)}
                className={`p-3 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                  isSelected
                    ? "border-amber-500/60 bg-amber-500/15 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-100">{p.label}</span>
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: p.color, boxShadow: `0 0 8px ${p.color}` }}
                  />
                </div>
                <span className="text-[10px] text-zinc-400">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Grid: Controls Left, Live Preview Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="card-institutional p-5 flex flex-col gap-5">
            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-3">
              <Sliders size={16} className="text-amber-400" />
              <h2 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider">
                Shading & Color Controls
              </h2>
            </div>

            {/* Base Background */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Base Background Hex
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.baseBackground.startsWith("#") ? config.baseBackground : "#070a0e"}
                    onChange={(e) => handleFieldChange("baseBackground", e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={config.baseBackground}
                    onChange={(e) => handleFieldChange("baseBackground", e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none"
                  />
                </div>
                <span className="text-[10px] text-zinc-500">
                  Deep dark tone beneath all layers (e.g. #070a0e, #060d17)
                </span>
              </div>

              {/* Card Surface */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Card Glass Surface
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.cardSurface.startsWith("#") ? config.cardSurface : "#18181b"}
                    onChange={(e) => handleFieldChange("cardSurface", e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={config.cardSurface}
                    onChange={(e) => handleFieldChange("cardSurface", e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none"
                  />
                </div>
                <span className="text-[10px] text-zinc-500">
                  Base fill for glassmorphic cards before opacity
                </span>
              </div>
            </div>

            {/* Transparency & Glow Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800/60 pt-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase text-zinc-400">
                    Card Transparency
                  </label>
                  <span className="text-xs font-mono text-amber-400">
                    {Math.round(config.cardTransparency * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={config.cardTransparency}
                  onChange={(e) => handleFieldChange("cardTransparency", parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <span className="text-[10px] text-zinc-500">
                  Glass opacity (Lower = sheer glass, Higher = solid card)
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono uppercase text-zinc-400">
                    Glow Shader Intensity
                  </label>
                  <span className="text-xs font-mono text-amber-400">
                    {Math.round(config.glowIntensity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.0"
                  step="0.05"
                  value={config.glowIntensity}
                  onChange={(e) => handleFieldChange("glowIntensity", parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <span className="text-[10px] text-zinc-500">
                  Border bloom and radial ambient highlight
                </span>
              </div>
            </div>

            {/* Accent & Border Colors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800/60 pt-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Primary Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.accentColor.startsWith("#") ? config.accentColor : "#f59e0b"}
                    onChange={(e) => handleFieldChange("accentColor", e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={config.accentColor}
                    onChange={(e) => handleFieldChange("accentColor", e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none"
                  />
                </div>
                <span className="text-[10px] text-zinc-500">
                  Buttons, highlights, active indicator lines
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Text Accent / Header Gold
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.textAccentColor.startsWith("#") ? config.textAccentColor : "#fbbf24"}
                    onChange={(e) => handleFieldChange("textAccentColor", e.target.value)}
                    className="w-9 h-9 rounded cursor-pointer bg-transparent border border-zinc-700"
                  />
                  <input
                    type="text"
                    value={config.textAccentColor}
                    onChange={(e) => handleFieldChange("textAccentColor", e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none"
                  />
                </div>
                <span className="text-[10px] text-zinc-500">
                  Header text highlights and active pills
                </span>
              </div>
            </div>

            {/* Border Tint & Glow Color */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-zinc-800/60 pt-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Card Border Tint
                </label>
                <input
                  type="text"
                  value={config.borderTint}
                  onChange={(e) => handleFieldChange("borderTint", e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none"
                  placeholder="rgba(245, 158, 11, 0.25)"
                />
                <span className="text-[10px] text-zinc-500">
                  Subtle card perimeter line (CSS color or rgba)
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-zinc-400">
                  Active Glow Color
                </label>
                <input
                  type="text"
                  value={config.glowColor}
                  onChange={(e) => handleFieldChange("glowColor", e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none"
                  placeholder="rgba(245, 158, 11, 0.25)"
                />
                <span className="text-[10px] text-zinc-500">
                  Hover drop-shadow and ambient radial wash
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Column (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="card-institutional p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100 font-mono uppercase tracking-wider">
                  Live Viewport Preview
                </h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>

            {/* Mock Surface Container with Current Theme Properties */}
            <div
              className="p-5 rounded-xl border transition-all flex flex-col gap-4"
              style={{
                backgroundColor: hexToRgba(config.cardSurface, config.cardTransparency),
                borderColor: config.borderTint,
                boxShadow: `0 0 24px -4px ${config.glowColor}`,
              }}
            >
              {/* Sample Metric Tile */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-zinc-400 tracking-wider">
                    NIFTY 50 SPOT
                  </span>
                  <div className="text-xl font-bold font-mono text-zinc-100 mt-0.5">
                    24,850.25
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-emerald-400 text-xs font-mono font-bold">
                    <TrendingUp size={14} />
                    <span>+120.40</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">+0.49% INTRADAY</span>
                </div>
              </div>

              {/* Sample Pills */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                <span
                  className="px-2.5 py-1 rounded-md text-xs font-mono font-bold"
                  style={{
                    backgroundColor: config.activePillColor,
                    color: config.textAccentColor,
                    border: `1px solid ${config.borderTint}`,
                    boxShadow: `0 0 8px ${config.glowColor}`,
                  }}
                >
                  15M ACTIVE
                </span>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-200">
                  1H
                </span>
                <span className="px-2.5 py-1 rounded-md text-xs font-mono text-zinc-400 hover:text-zinc-200">
                  1D
                </span>
              </div>

              {/* Sample Action Button */}
              <button
                type="button"
                className="w-full py-2 rounded-lg font-semibold text-xs text-black font-mono tracking-wider transition-all"
                style={{
                  backgroundColor: config.accentColor,
                  boxShadow: `0 0 16px ${config.glowColor}`,
                }}
              >
                EXECUTE SIGNAL SIMULATION
              </button>
            </div>

            {/* Generated CSS Variables Inspect Box */}
            <div className="p-3 rounded-lg bg-black/60 border border-zinc-800/80 flex flex-col gap-1.5 font-mono text-[11px] text-zinc-400 overflow-x-auto">
              <span className="text-[10px] uppercase text-zinc-500 font-bold">
                CSS Variables Injected:
              </span>
              <div>--eb-base-bg: {config.baseBackground};</div>
              <div>--eb-card-surface: {hexToRgba(config.cardSurface, config.cardTransparency)};</div>
              <div>--eb-border-tint: {config.borderTint};</div>
              <div>--eb-accent-color: {config.accentColor};</div>
              <div>--eb-glow-color: {config.glowColor};</div>
              <div>--eb-text-accent: {config.textAccentColor};</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
