import { useState, useEffect, useCallback, memo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Compass,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Clock,
  ArrowUpRight,
  Pause,
  Play,
  Radar,
} from "lucide-react";
import { getCachedFeatures } from "@/lib/features-client";
import { getAstro } from "@/lib/astro.functions";
import { getDecisionSnapshot } from "@/lib/decision.functions";
import { IctUnicornRadarView } from "@/components/dashboard/IctUnicornRadarView";

export interface AstroRegimeHeroCarouselProps {
  niftySpot?: number;
  bankNiftySpot?: number;
}

export type DeckTabId = "astro" | "smc" | "derivatives" | "unicorn";

export interface DeckTabConfig {
  readonly id: DeckTabId;
  readonly label: string;
  readonly icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const DECK_TABS: readonly DeckTabConfig[] = [
  { id: "astro", label: "Astro Harmonics", icon: Sparkles },
  { id: "smc", label: "SMC Order Flow", icon: Layers },
  { id: "derivatives", label: "Derivatives & GEX", icon: BarChart3 },
  { id: "unicorn", label: "🦄 ICT Unicorn Radar & SMT", icon: Radar },
];

/**
 * Safe institutional PCR formatter.
 * Handles numbers, numeric strings, and DecisionSummary PCR objects ({ pcrOi: number, ... }).
 * Never throws TypeError: .toFixed is not a function.
 */
export const formatPcr = (val: unknown, fallback: string = "1.00"): string => {
  if (val == null) return fallback;
  let candidate: unknown = val;
  if (typeof candidate === "object" && candidate !== null) {
    if (Object.prototype.hasOwnProperty.call(candidate, "pcrOi")) {
      candidate = (candidate as { pcrOi?: unknown }).pcrOi;
    }
  }
  if (candidate == null) return fallback;
  const num = typeof candidate === "number" ? candidate : Number(candidate);
  return isNaN(num) || !isFinite(num) || num <= 0 ? fallback : num.toFixed(2);
};

export const AstroRegimeHeroCarousel = memo(function AstroRegimeHeroCarousel({
  niftySpot = 23960.6,
  bankNiftySpot = 55913.6,
}: AstroRegimeHeroCarouselProps) {
  const [activeTab, setActiveTab] = useState<DeckTabId>("astro");
  const [isPaused, setIsPaused] = useState(false);

  // Dynamic live ephemeris and decision confluence queries
  const { data: astroData } = useQuery({
    queryKey: ["astro-data"],
    queryFn: () => getAstro(),
    staleTime: 60_000,
  });

  const { data: decisionData } = useQuery({
    queryKey: ["decision-snapshot"],
    queryFn: () => getDecisionSnapshot(),
    staleTime: 60_000,
  });

  const currentNifty = niftySpot && niftySpot > 1000 ? niftySpot : (astroData?.livePrice ?? 24500);
  const gannLower = Math.floor(currentNifty / 100) * 100 - 60;
  const gannUpper = Math.ceil(currentNifty / 100) * 100 + 40;

  const activeAspect =
    astroData?.planets && astroData.planets.length >= 2
      ? `${astroData.planets[0].planet} ${Math.round(astroData.planets[0].degree)}° ${astroData.planets[1].planet}`
      : "Mars 120° Jupiter";

  const nakshatraName = astroData?.moonNakshatra
    ? `${astroData.moonNakshatra} Nakshatra`
    : "Pushya Nakshatra";

  const moonPhaseDesc = astroData?.moonPhase
    ? `${astroData.moonPhase.phaseName} (${Math.round(astroData.moonPhase.illumination || 82)}% Illum)`
    : "Waxing Gibbous (82% Illumination)";

  const decision = decisionData?.decision;
  const isBullish = decision?.action ? decision.action.includes("BUY_CE") : true;
  const flowBiasText = isBullish ? "BULLISH ACCUMULATION" : "BEARISH DISTRIBUTION";
  const confidencePct = Math.round((decision?.confidence ?? 0.68) * 100);

  const bslLow = Math.round(currentNifty + 80);
  const bslHigh = Math.round(currentNifty + 120);
  const fvgLow = Math.round(currentNifty - 120);
  const fvgHigh = Math.round(currentNifty - 80);

  const pcrText = `${formatPcr(decisionData?.summary?.pcr, "1.08")} PCR`;
  const maxPainStrike = `${(Math.round(currentNifty / 100) * 100).toLocaleString("en-IN")} Strike`;

  const nextSlide = useCallback(() => {
    setActiveTab((prev) => {
      const idx = DECK_TABS.findIndex((t) => t.id === prev);
      const nextIdx = (idx + 1) % DECK_TABS.length;
      return DECK_TABS[nextIdx].id;
    });
  }, []);

  const prevSlide = useCallback(() => {
    setActiveTab((prev) => {
      const idx = DECK_TABS.findIndex((t) => t.id === prev);
      const prevIdx = (idx - 1 + DECK_TABS.length) % DECK_TABS.length;
      return DECK_TABS[prevIdx].id;
    });
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(nextSlide, 7000);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  return (
    <section
      aria-label="Market Regime and Astro Intelligence Carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative mb-5 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 p-5 md:p-6 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/30"
    >
      {/* Dynamic Background Glow Ambient Elements */}
      {activeTab === "astro" && (
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
      )}
      {activeTab === "smc" && (
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
      )}
      {activeTab === "derivatives" && (
        <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
      )}
      {activeTab === "unicorn" && (
        <div className="absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
      )}

      {/* Top Bar: Slide Tabs & Manual Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Institutional Research Deck
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-zinc-400">
            {isPaused ? (
              <span className="inline-flex items-center gap-1 text-amber-400 font-mono text-[10px]">
                <Pause size={10} /> PAUSED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-zinc-500 font-mono text-[10px]">
                <Play size={10} /> AUTO-CYCLE (7s)
              </span>
            )}
          </span>
        </div>

        {/* Tab Selector Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {DECK_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white/10 text-zinc-100 border border-white/20 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                <Icon
                  size={13}
                  className={
                    isActive
                      ? tab.id === "unicorn"
                        ? "text-amber-400"
                        : "text-cyan-400"
                      : "text-zinc-500"
                  }
                />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">
                  {tab.id === "unicorn" ? "Unicorn" : tab.label.split(" ")[0]}
                </span>
                {tab.id === "unicorn" && (
                  <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] rounded-full border border-amber-500/40 font-bold ml-0.5">
                    LIVE
                  </span>
                )}
              </button>
            );
          })}

          <div className="ml-2 flex items-center gap-1">
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous slide"
              className="rounded-md border border-white/10 bg-zinc-900/80 p-1 text-zinc-400 transition-colors hover:text-zinc-100 hover:bg-zinc-800"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next slide"
              className="rounded-md border border-white/10 bg-zinc-900/80 p-1 text-zinc-400 transition-colors hover:text-zinc-100 hover:bg-zinc-800"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Slide Content Deck */}
      <div className="pt-4 min-h-[290px] sm:min-h-[240px] transition-[min-height] duration-200">
        {/* SLIDE 0: ASTRO CYCLE HARMONICS */}
        {activeTab === "astro" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-400" />
                  Planetary Harmonics &amp; Intraday Turning Windows
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Astronomical ephemeris angles synced with Gann Square of 9 octaves and price-degree confluence.
                </p>
              </div>
              <Link
                to="/astro"
                className="inline-flex items-center gap-1 text-xs font-medium text-purple-400 hover:text-purple-300 hover:underline shrink-0"
              >
                Open Astro Ephemeris Desk <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Active Planetary Aspect
                </span>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{activeAspect}</p>
                <span className="mt-1 inline-block text-[11px] text-purple-400 font-medium">
                  Harmonic Angular Resonance
                </span>
              </div>

              {getCachedFeatures().astroReversalWindow !== "hide" ? (
                <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                    Key Time Reversal Window
                  </span>
                  <p className="mt-1 text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                    <Clock size={14} className="text-amber-400" /> 13:45 — 14:15 IST
                  </p>
                  <span className="mt-1 inline-block text-[11px] text-amber-400 font-medium">
                    Lunar Ingress to MC
                  </span>
                </div>
              ) : null}

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Moon Phase &amp; Nakshatra
                </span>
                <p className="mt-1 text-sm font-semibold text-zinc-100">{nakshatraName}</p>
                <span className="mt-1 inline-block text-[11px] text-emerald-400 font-medium">
                  {moonPhaseDesc}
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Gann Octave Support/Resist
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">
                  {gannLower.toLocaleString("en-IN")} / {gannUpper.toLocaleString("en-IN")}
                </p>
                <span className="mt-1 inline-block text-[11px] text-cyan-400 font-medium">
                  180° Major Square Harmony
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 1: INSTITUTIONAL SMART MONEY REGIME */}
        {activeTab === "smc" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  <Layers size={18} className="text-emerald-400" />
                  Institutional Smart Money Order Flow &amp; Liquidity
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Algorithmic liquidity maps, Fair Value Gaps (FVG), and institutional order blocks.
                </p>
              </div>
              <Link
                to="/decision"
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:underline shrink-0"
              >
                Confluence Decision Center <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Order Flow Bias
                </span>
                <p className={`mt-1 text-sm font-semibold flex items-center gap-1 ${isBullish ? "text-emerald-400" : "text-rose-400"}`}>
                  {isBullish ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {flowBiasText}
                </p>
                <span className="mt-1 inline-block text-[11px] text-zinc-400">
                  +{confidencePct}% Multi-Engine Confluence
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Primary Liquidity Pool (BSL)
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">
                  {bslLow.toLocaleString("en-IN")} — {bslHigh.toLocaleString("en-IN")}
                </p>
                <span className="mt-1 inline-block text-[11px] text-cyan-400 font-medium">
                  Equal Highs Liquidity Magnet
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Discount Mitigation Zone
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">
                  {fvgLow.toLocaleString("en-IN")} — {fvgHigh.toLocaleString("en-IN")}
                </p>
                <span className="mt-1 inline-block text-[11px] text-emerald-400 font-medium">
                  Unfilled Bullish 15m FVG
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Market Structure Status
                </span>
                <p className="mt-1 text-sm font-semibold text-zinc-100">CHoCH Confirmed</p>
                <span className="mt-1 inline-block text-[11px] text-purple-400 font-medium">
                  Higher Lows Formation
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: DERIVATIVES SENTIMENT & GEX */}
        {activeTab === "derivatives" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
                  <BarChart3 size={18} className="text-cyan-400" />
                  Derivatives Sentiment &amp; Gamma Exposure (GEX)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Upstox live option chain matrix, Dealer positioning, and Max Pain gravitation.
                </p>
              </div>
              <Link
                to="/options-chain"
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 hover:underline shrink-0"
              >
                Open Live Options Matrix <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Combined Put-Call Ratio
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-emerald-400">{pcrText}</p>
                <span className="mt-1 inline-block text-[11px] text-zinc-400">
                  Put Writing Dominance (Supportive)
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Expiry Max Pain Strike
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">{maxPainStrike}</p>
                <span className="mt-1 inline-block text-[11px] text-amber-400 font-medium">
                  Spot Gravitation Buffer
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Dealer Gamma Flip
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">23,950 Strike</p>
                <span className="mt-1 inline-block text-[11px] text-cyan-400 font-medium">
                  Long Gamma (Volatility Dampening)
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Call Wall / Put Wall
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">24,200 / 23,800</p>
                <span className="mt-1 inline-block text-[11px] text-purple-400 font-medium">
                  Key Institutional Boundaries
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 3: 🦄 ICT UNICORN RADAR & SMT DIVERGENCE */}
        {activeTab === "unicorn" && (
          <div className="space-y-4 animate-in fade-in duration-300 max-h-[460px] sm:max-h-none overflow-y-auto sm:overflow-visible pr-1 overscroll-contain">
            <IctUnicornRadarView />
          </div>
        )}
      </div>

      {/* Slide Indicators Progress Dots */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {DECK_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-label={`Go to ${tab.label}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              activeTab === tab.id ? "w-8 bg-cyan-400" : "w-2 bg-white/20 hover:bg-white/40"
            }`}
          />
        ))}
      </div>
    </section>
  );
});

export { AstroRegimeHeroCarousel as InstitutionalResearchDeck };
