// Phase 36.5 — Interactive Beginner Onboarding Guide: "How to Trade Lunar & Gann Cycles"
// Educational 4-step framework explaining Moon-Sun synodic windows, confluence filtering,
// derivatives volatility, and invariant risk trade execution.

import { useState } from "react";
import {
  X,
  BookOpen,
  Orbit,
  TrendingUp,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Target,
  Sparkles,
  Info,
} from "lucide-react";

interface ChronoWheelGuideModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ChronoWheelGuideModal({ isOpen, onClose }: ChronoWheelGuideModalProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    step1: true,
    step2: false,
    step3: false,
    step4: false,
  });

  if (!isOpen) return null;

  const toggleChecklist = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const steps = [
    {
      num: 1,
      title: "Step 1: Identify Lunar Window",
      subtitle: "Synodic Moon-Sun Separation",
      icon: Orbit,
      badge: "Ephemeris Mapping",
      color: "from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-300",
      content: (
        <div className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          <p>
            Unlike conventional Gregorian calendars which drift by ~11 days each year,
            <strong> Gann and Vedic cyclical models</strong> anchor trading windows to the
            exact longitudinal separation angle between the Moon and the Sun:
          </p>
          <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800 font-mono text-xs space-y-1">
            <div className="text-amber-400 font-bold">Moon-Sun Synodic Formula:</div>
            <div className="text-zinc-300">Phase Angle θ = (λ_moon - λ_sun) mod 360°</div>
            <div className="text-zinc-500 text-[11px]">
              Tithi = floor(θ / 12°) + 1 (1 to 30 Vedic Lunar Days)
            </div>
          </div>
          <p>
            ChronoWheel automatically backtracks this precise angular relationship across the past
            <strong> 10 historical years (T-1 to T-10)</strong>, identifying exact trading sessions where
            institutional cycle rhythm repeated.
          </p>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <Info className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span>Select upcoming dates (e.g., today to +3 days) using the top date picker to isolate the active window.</span>
          </div>
        </div>
      ),
    },
    {
      num: 2,
      title: "Step 2: Filter Confluence (≥80%)",
      subtitle: "High-Probability Directional Edge",
      icon: TrendingUp,
      badge: "Statistical Edge",
      color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/40 text-emerald-300",
      content: (
        <div className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          <p>
            Never trade random noise. Institutional quantitative desks only allocate capital when an
            instrument displays overwhelming historical directional persistence:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
              <span className="text-emerald-400 font-bold block mb-1">▲ High Bullish (≥80% Win Rate)</span>
              <span className="text-zinc-400 text-[11px]">
                Stock gained in at least 8 out of 10 historical cycle windows with positive average return.
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25">
              <span className="text-rose-400 font-bold block mb-1">▼ High Bearish (≤20% Win Rate)</span>
              <span className="text-zinc-400 text-[11px]">
                Stock dropped in at least 8 out of 10 historical cycle windows — prime candidate for short fading.
              </span>
            </div>
          </div>
          <p>
            Look for stocks where the <strong>Segmented Consistency Bar</strong> is overwhelmingly green or red,
            and average returns exceed the realized volatility.
          </p>
        </div>
      ),
    },
    {
      num: 3,
      title: "Step 3: Derivatives & IV Check",
      subtitle: "Option Pricing & Volatility Skew",
      icon: Sliders,
      badge: "Derivatives Profile",
      color: "from-blue-500/20 to-blue-600/10 border-blue-500/40 text-blue-300",
      content: (
        <div className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          <p>
            A stock can move in the anticipated direction, but trading the wrong option instrument can still cause a loss
            due to <strong>volatility crush (Vega)</strong> or <strong>theta decay</strong>.
          </p>
          <div className="space-y-2 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
              <div>
                <strong className="text-emerald-300">IV Percentile &lt; 35% (Cheap Options):</strong>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Implied volatility is historically depressed. Outright buying of ATM/OTM Calls or Puts offers explosive convexity.
                </p>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start gap-2.5">
              <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
              <div>
                <strong className="text-amber-300">IV Percentile &gt; 65% (Expensive Options):</strong>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Option premiums are inflated. Avoid naked buying! Prefer Bull/Bear Spreads or trade underlying Cash/Futures contracts.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      num: 4,
      title: "Step 4: Execute with Invariant Risk",
      subtitle: "Exact Entry, SL, TP1, TP2 & Sizing",
      icon: ShieldCheck,
      badge: "Mathematical Invariance",
      color: "from-purple-500/20 to-purple-600/10 border-purple-500/40 text-purple-300",
      content: (
        <div className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
          <p>
            Cycle alignment provides edge, but <strong>risk management provides survival</strong>.
            Every screened card includes pre-computed execution levels:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
            <div className="p-2 rounded bg-zinc-950 border border-zinc-800 text-center">
              <div className="text-[10px] text-zinc-500 uppercase">Entry Zone</div>
              <div className="text-amber-300 font-bold">LTP ± 0.3%</div>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-rose-500/30 text-center">
              <div className="text-[10px] text-rose-400 uppercase">Hard SL</div>
              <div className="text-rose-300 font-bold">1.6% - 5.5%</div>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-emerald-500/30 text-center">
              <div className="text-[10px] text-emerald-400 uppercase">Target 2</div>
              <div className="text-emerald-300 font-bold">+2.5R Gain</div>
            </div>
            <div className="p-2 rounded bg-zinc-950 border border-purple-500/30 text-center">
              <div className="text-[10px] text-purple-400 uppercase">Risk : Reward</div>
              <div className="text-purple-300 font-bold">1 : 2.5</div>
            </div>
          </div>
          <p className="text-zinc-400 text-xs">
            Use the built-in <strong>Position Sizing Calculator</strong> inside each card. Set your total portfolio capital
            and risk percentage (recommended: 1% to 2% max per trade) to instantly know how many shares or F&O lots to enter.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0e1017] border border-amber-500/30 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(245,158,11,0.12)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-800/80 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  How to Trade Lunar & Gann Cycles
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  BEGINNER GUIDE
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Master the 4-step institutional framework for quantitative cyclical execution.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-zinc-800/80 bg-zinc-950/40">
          {steps.map((s) => {
            const Icon = s.icon;
            const isActive = activeStep === s.num;
            return (
              <button
                key={s.num}
                onClick={() => setActiveStep(s.num)}
                className={`py-3 px-2 sm:px-4 text-left transition-all border-b-2 flex flex-col sm:flex-row items-center sm:items-start gap-2 ${
                  isActive
                    ? "border-amber-400 bg-amber-500/10 text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold flex-shrink-0 ${
                    isActive ? "bg-amber-400 text-black" : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {s.num}
                </div>
                <div className="hidden sm:block truncate">
                  <div className="text-xs font-semibold truncate">{s.title.split(":")[1] || s.title}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{s.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Step Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {steps.map((s) => {
            if (s.num !== activeStep) return null;
            const Icon = s.icon;
            return (
              <div key={s.num} className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${s.color} border`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{s.title}</h3>
                      <p className="text-xs text-zinc-400">{s.subtitle}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                    {s.badge}
                  </span>
                </div>

                {s.content}
              </div>
            );
          })}

          {/* Interactive Pre-Flight Checklist */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80">
            <h4 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              Pre-Flight Trade Checklist (Check before entering):
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
              <label
                onClick={() => toggleChecklist("step1")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 select-none"
              >
                <input
                  type="checkbox"
                  checked={checklist.step1}
                  onChange={() => {}}
                  className="rounded border-zinc-700 text-amber-500 focus:ring-0"
                />
                <span className={checklist.step1 ? "text-zinc-200 line-through opacity-70" : "text-zinc-300"}>
                  1. Active synodic window identified
                </span>
              </label>

              <label
                onClick={() => toggleChecklist("step2")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 select-none"
              >
                <input
                  type="checkbox"
                  checked={checklist.step2}
                  onChange={() => {}}
                  className="rounded border-zinc-700 text-amber-500 focus:ring-0"
                />
                <span className={checklist.step2 ? "text-zinc-200 line-through opacity-70" : "text-zinc-300"}>
                  2. Win Rate ≥ 80% over 5-10 years
                </span>
              </label>

              <label
                onClick={() => toggleChecklist("step3")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 select-none"
              >
                <input
                  type="checkbox"
                  checked={checklist.step3}
                  onChange={() => {}}
                  className="rounded border-zinc-700 text-amber-500 focus:ring-0"
                />
                <span className={checklist.step3 ? "text-zinc-200 line-through opacity-70" : "text-zinc-300"}>
                  3. IV Percentile matches strategy (Call/Spread)
                </span>
              </label>

              <label
                onClick={() => toggleChecklist("step4")}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 select-none"
              >
                <input
                  type="checkbox"
                  checked={checklist.step4}
                  onChange={() => {}}
                  className="rounded border-zinc-700 text-amber-500 focus:ring-0"
                />
                <span className={checklist.step4 ? "text-zinc-200 line-through opacity-70" : "text-zinc-300"}>
                  4. Exact SL & Lot Size sized to ≤2% max loss
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeStep > 1 && (
              <button
                onClick={() => setActiveStep((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs transition-colors"
              >
                ← Back
              </button>
            )}
            {activeStep < 4 && (
              <button
                onClick={() => setActiveStep((p) => p + 1)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors flex items-center gap-1"
              >
                <span>Next Step</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5"
          >
            <span>Understood, Let's Trade Cycles</span>
            <Target className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}