import { useState, useEffect, useCallback, memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  Compass,
  TrendingUp,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  Clock,
  ArrowUpRight,
  Pause,
  Play,
} from "lucide-react";

export interface AstroRegimeHeroCarouselProps {
  niftySpot?: number;
  bankNiftySpot?: number;
}

export const AstroRegimeHeroCarousel = memo(function AstroRegimeHeroCarousel({
  niftySpot = 23960.6,
  bankNiftySpot = 55913.6,
}: AstroRegimeHeroCarouselProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % 3);
  }, []);

  const prevSlide = useCallback(() => {
    setActiveSlide((prev) => (prev - 1 + 3) % 3);
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
      {activeSlide === 0 && (
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
      )}
      {activeSlide === 1 && (
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
      )}
      {activeSlide === 2 && (
        <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl pointer-events-none transition-all duration-1000" />
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
        <div className="flex items-center gap-1.5">
          {[
            { id: 0, label: "Astro Harmonics", icon: Sparkles },
            { id: 1, label: "SMC Order Flow", icon: Layers },
            { id: 2, label: "Derivatives & GEX", icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSlide === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSlide(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white/10 text-zinc-100 border border-white/20 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                <Icon size={13} className={isActive ? "text-cyan-400" : "text-zinc-500"} />
                <span className="hidden sm:inline">{tab.label}</span>
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
      <div className="pt-4">
        {/* SLIDE 0: ASTRO CYCLE HARMONICS */}
        {activeSlide === 0 && (
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
                <p className="mt-1 text-sm font-semibold text-zinc-100">Mars 120° Jupiter</p>
                <span className="mt-1 inline-block text-[11px] text-purple-400 font-medium">
                  Trine Harmonic (Bull Expansion)
                </span>
              </div>

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

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Moon Phase &amp; Nakshatra
                </span>
                <p className="mt-1 text-sm font-semibold text-zinc-100">Pushya Nakshatra</p>
                <span className="mt-1 inline-block text-[11px] text-emerald-400 font-medium">
                  Waxing Gibbous (82% Illumination)
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Gann Octave Support/Resist
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">23,940 / 24,080</p>
                <span className="mt-1 inline-block text-[11px] text-cyan-400 font-medium">
                  180° Major Square Harmony
                </span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 1: INSTITUTIONAL SMART MONEY REGIME */}
        {activeSlide === 1 && (
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
                <p className="mt-1 text-sm font-semibold text-emerald-400 flex items-center gap-1">
                  <TrendingUp size={14} /> BULLISH ACCUMULATION
                </p>
                <span className="mt-1 inline-block text-[11px] text-zinc-400">
                  +68% Multi-Engine Confluence
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Primary Liquidity Pool (BSL)
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">24,120 — 24,150</p>
                <span className="mt-1 inline-block text-[11px] text-cyan-400 font-medium">
                  Equal Highs Liquidity Magnet
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Discount Mitigation Zone
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">23,880 — 23,910</p>
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
        {activeSlide === 2 && (
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
                <p className="mt-1 text-sm font-semibold font-mono text-emerald-400">1.08 PCR</p>
                <span className="mt-1 inline-block text-[11px] text-zinc-400">
                  Put Writing Dominance (Supportive)
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-zinc-900/60 p-3.5 backdrop-blur-sm">
                <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-400">
                  Expiry Max Pain Strike
                </span>
                <p className="mt-1 text-sm font-semibold font-mono text-zinc-100">24,000 Strike</p>
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
      </div>

      {/* Slide Indicators Progress Dots */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {[0, 1, 2].map((idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveSlide(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              activeSlide === idx ? "w-8 bg-cyan-400" : "w-2 bg-white/20 hover:bg-white/40"
            }`}
          />
        ))}
      </div>
    </section>
  );
});
