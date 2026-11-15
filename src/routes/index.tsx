import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock,
  Compass,
  Cpu,
  Database,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Lock,
  Menu,
  Orbit,
  Radar,
  Radio,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { EagleLogo } from "@/components/EagleLogo";
import { useAuth } from "@/lib/auth-context";
import { getMarketData, type MarketDataResponse } from "@/lib/market.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EagleBABA | Institutional Quantitative Workstation" },
      {
        name: "description",
        content:
          "Institutional Quantitative Edge decoded by Time, Order Flow & Mathematical Harmonics. Precision-engineered workstation for Indian F&O, Commodities, and Equities.",
      },
    ],
  }),
  component: PublicLandingPage,
});

export function PublicLandingPage() {
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Ingest live market data for real-time index ticks in hero
  const { data: marketData } = useQuery<MarketDataResponse>({
    queryKey: ["landingMarketData"],
    queryFn: () => getMarketData(),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const tickerItems = useMemo(() => [
    { symbol: "NIFTY 50", name: "NSE Index", expected: "^NSEI", quote: marketData?.nifty, index: true },
    { symbol: "BANK NIFTY", name: "Banking Benchmark", expected: "^NSEBANK", quote: marketData?.banknifty, index: true },
    { symbol: "BSE SENSEX", name: "BSE 30", expected: "^BSESN", quote: marketData?.sensex, index: true },
    { symbol: "COMEX GOLD", name: "GC1! Continuous", expected: "GC=F", quote: marketData?.gold, index: false },
    { symbol: "BTC / USDT", name: "Crypto Digital", expected: "BTC-USD", quote: marketData?.btc, index: false },
  ].map(({ symbol, name, expected, quote: candidate, index }) => {
    const quote = candidate?.symbol === expected ? candidate : null;
    const daily = quote?.dailyQuote?.source === "UPSTOX" ? quote.dailyQuote : null;
    const changePct = index ? daily?.changePct ?? null : quote?.changePct ?? null;
    return {
      symbol,
      name,
      price: quote?.livePrice ?? null,
      changePct,
      isUp: changePct !== null && changePct > 0,
      status: quote?.marketState ?? "UNAVAILABLE",
    };
  }), [marketData]);

  const terminalUrl = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <div className="min-h-screen bg-[#08090C] text-[#E0E2EC] font-sans antialiased selection:bg-[#E5B869]/30 selection:text-[#FFF7D6]">
      {/* ── PUBLIC NAVIGATION BAR ── */}
      <header className="sticky top-0 z-50 w-full border-b border-[#E5B869]/15 bg-[#08090C]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo & Brand Identity */}
          <Link to="/" className="flex items-center gap-3.5 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-[#E5B869]/40 to-[#06B6D4]/30 blur-sm opacity-60 group-hover:opacity-100 transition duration-300" />
              <img
                src="/images/eaglebaba_logo1.png"
                alt="EagleBABA"
                className="relative w-[38px] h-[38px] rounded-xl object-contain"
              />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-wider text-white">EagleBABA</span>
                <span className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded border border-[#E5B869]/40 bg-[#E5B869]/10 text-[#E5B869]">
                  QUANT
                </span>
              </div>
              <span className="text-[10px] tracking-widest uppercase text-zinc-400 font-mono">
                Institutional Workstation
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7">
            <a
              href="#features"
              className="text-xs font-medium text-zinc-300 hover:text-[#E5B869] transition tracking-wide"
            >
              Features
            </a>
            <a
              href="#chronowheel"
              className="text-xs font-medium text-zinc-300 hover:text-[#E5B869] transition tracking-wide"
            >
              ChronoWheel
            </a>
            <a
              href="#unicorn-radar"
              className="text-xs font-medium text-zinc-300 hover:text-[#E5B869] transition tracking-wide"
            >
              Unicorn Radar
            </a>
            <a
              href="#architecture"
              className="text-xs font-medium text-zinc-300 hover:text-[#E5B869] transition tracking-wide"
            >
              Architecture
            </a>
            <a
              href="#security"
              className="text-xs font-medium text-zinc-300 hover:text-[#E5B869] transition tracking-wide"
            >
              Security
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3.5">
            {isAuthenticated ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#E5B869] via-[#F3CE85] to-[#C99738] text-black shadow-[0_0_20px_rgba(229,184,105,0.35)] hover:shadow-[0_0_30px_rgba(229,184,105,0.6)] transition-all transform hover:-translate-y-0.5"
              >
                Go to Dashboard
                <ArrowRight size={14} className="stroke-[2.5]" />
              </Link>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-[#E5B869] transition tracking-wide"
                >
                  Sign In
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#E5B869] via-[#F3CE85] to-[#C99738] text-black shadow-[0_0_20px_rgba(229,184,105,0.35)] hover:shadow-[0_0_30px_rgba(229,184,105,0.6)] transition-all transform hover:-translate-y-0.5"
                >
                  <Zap size={14} className="fill-black stroke-black" />
                  Launch Terminal
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex md:hidden items-center">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-[#E5B869]/20 text-zinc-300 hover:text-[#E5B869]"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#E5B869]/20 bg-[#0E1015]/95 px-6 py-5 flex flex-col gap-4 backdrop-blur-2xl">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-zinc-300 hover:text-[#E5B869]"
            >
              Features
            </a>
            <a
              href="#chronowheel"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-zinc-300 hover:text-[#E5B869]"
            >
              ChronoWheel
            </a>
            <a
              href="#unicorn-radar"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-zinc-300 hover:text-[#E5B869]"
            >
              Unicorn Radar
            </a>
            <a
              href="#architecture"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-zinc-300 hover:text-[#E5B869]"
            >
              Architecture
            </a>
            <a
              href="#security"
              onClick={() => setMobileMenuOpen(false)}
              className="text-sm font-medium text-zinc-300 hover:text-[#E5B869]"
            >
              Security
            </a>
            <div className="pt-2 border-t border-zinc-800 flex flex-col gap-2.5">
              {isAuthenticated ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#E5B869] text-black"
                >
                  Go to Dashboard →
                </Link>
              ) : (
                <>
                  <Link
                    to="/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-2 text-xs font-medium text-zinc-300 border border-zinc-800 rounded-lg"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/auth"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#E5B869] text-black shadow-lg shadow-[#E5B869]/20"
                  >
                    ⚡ Launch Terminal
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── SECTION 1: HERO & REAL-TIME TICKER ── */}
      <section className="relative overflow-hidden pt-16 pb-20 md:pt-24 md:pb-28 border-b border-[#E5B869]/10">
        {/* Subtle Ambient Background Lighting */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-[#E5B869]/12 via-[#06B6D4]/5 to-transparent blur-[120px] pointer-events-none -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Institutional Release Pill */}
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-[#E5B869]/30 bg-[#0E1015]/80 backdrop-blur-md mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
            </span>
            <span className="text-[11px] font-mono tracking-widest text-[#E5B869] uppercase font-semibold">
              INSTITUTIONAL QUANTITATIVE WORKSTATION • V3.2 RELEASE
            </span>
          </div>

          {/* Master Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.12]">
            Institutional Quantitative Edge{" "}
            <span className="block mt-2 bg-gradient-to-r from-[#E5B869] via-[#F7D89C] to-[#06B6D4] bg-clip-text text-transparent">
              Decoded by Time, Order Flow & Harmonics
            </span>
          </h1>

          {/* Subheading */}
          <p className="mt-6 text-base sm:text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed">
            Precision-engineered research workstation for Indian F&amp;O, Commodities, and
            Equities. Harness dynamic 10-year Lunar synodic cycles, ICT Unicorn scanners, and Gann
            Square of 9 mechanics.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={terminalUrl}
              className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-[#E5B869] via-[#F3CE85] to-[#C99738] text-black shadow-[0_0_30px_rgba(229,184,105,0.4)] hover:shadow-[0_0_45px_rgba(229,184,105,0.6)] transition-all transform hover:-translate-y-0.5"
            >
              <Zap size={18} className="fill-black stroke-black" />
              Launch Terminal
            </Link>

            <a
              href="#features"
              className="inline-flex items-center gap-2 px-7 py-4 rounded-xl text-sm font-semibold tracking-wider border border-[#E5B869]/30 bg-[#0E1015]/70 text-zinc-200 hover:border-[#E5B869] hover:text-white backdrop-blur-md transition-all"
            >
              <Compass size={17} className="text-[#E5B869]" />
              Explore Modules
            </a>
          </div>

          {/* Real-Time Live Mini-Ticker */}
          <div className="mt-16 pt-8 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-3 text-left">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  REAL-TIME UPSTOX V3 FEED
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                LOW-LATENCY STREAMING QUOTES
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {tickerItems.map((item) => (
                <div
                  key={item.symbol}
                  className="rounded-xl border border-zinc-800/80 bg-[#0E1015]/80 p-3.5 backdrop-blur-md text-left transition hover:border-[#E5B869]/30"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white tracking-wide">
                      {item.symbol}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-base font-mono font-bold text-white">
                    ₹{item.price === null ? "-" : item.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-500">{item.name}</span>
                    <span
                      className={`inline-flex items-center gap-0.5 font-semibold ${
                        item.changePct === null || item.changePct === 0 ? "text-zinc-400" : item.isUp ? "text-[#10B981]" : "text-rose-400"
                      }`}
                    >
                      {item.changePct === null || item.changePct === 0 ? null : item.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {item.isUp ? "+" : ""}
                      {item.changePct === null ? "-" : `${item.changePct.toFixed(2)}%`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: INTERACTIVE MODULES BREAKDOWN ── */}
      <section id="features" className="py-20 md:py-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#E5B869]/30 bg-[#E5B869]/10 text-[#E5B869] text-xs font-mono uppercase tracking-widest mb-3">
            PROPRIETARY QUANTITATIVE SUITE
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Five Interlocking Mathematical Engines
          </h2>
          <p className="mt-4 text-zinc-400 text-sm sm:text-base leading-relaxed">
            Eliminate subjective bias and retail indicators. Every decision matrix is governed by
            rigorous quantitative ephemerides, order flow imbalances, and invariant risk sizing.
          </p>
        </div>

        <div className="space-y-8">
          {/* Card 1: ChronoWheel */}
          <div
            id="chronowheel"
            className="rounded-2xl border border-[#E5B869]/30 bg-[#0E1015] p-6 sm:p-8 lg:p-10 relative overflow-hidden group hover:border-[#E5B869]/60 transition-all duration-300"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#E5B869]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row gap-8 items-start justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-2.5 rounded-xl border border-[#E5B869]/30 bg-[#E5B869]/10 text-[#E5B869]">
                    <Orbit size={24} />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-[#E5B869] uppercase tracking-wider font-semibold">
                      MODULE 01 • TEMPORAL DYNAMICS
                    </span>
                    <h3 className="text-2xl font-bold text-white tracking-tight">
                      ChronoWheel (Gann &amp; Dynamic Lunar Decoder)
                    </h3>
                  </div>
                </div>

                <p className="mt-4 text-sm text-zinc-300 leading-relaxed">
                  Decodes long-term cyclical recurring tendencies across 200+ NSE F&amp;O stocks by
                  matching 10-year synodic lunar phases (Tithi and Paksha). Dynamically adjusts for
                  the ~11-day annual Gregorian drift to isolate precise astronomical turning
                  windows.
                </p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-xl border border-zinc-800 bg-[#08090C] p-3.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Sparkles size={14} className="text-[#E5B869]" />
                      10-Year Synodic Backtesting
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Calculates historical win rates, average trade return, and maximum drawdown
                      across a decade of verified EOD candles.
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-[#08090C] p-3.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <TrendingUp size={14} className="text-[#10B981]" />
                      Realized Volatility Execution
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Ingests 20-day annualized realized volatility to compute deterministic Entry
                      Zones, Invariant Stop-Loss, and TP1–TP3 targets.
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-zinc-800 bg-zinc-900/60 text-zinc-300">
                    200+ F&amp;O Universe
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-[#E5B869]/30 bg-[#E5B869]/10 text-[#E5B869]">
                    ≥80% Win-Rate Confluence Filter
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-zinc-800 bg-zinc-900/60 text-zinc-300">
                    Auto Entry/SL/TP Math
                  </span>
                </div>
              </div>

              {/* Visual Metrics Widget */}
              <div className="w-full lg:w-80 rounded-xl border border-[#E5B869]/20 bg-[#08090C] p-5 shrink-0">
                <div className="text-xs font-mono text-[#E5B869] uppercase tracking-wider mb-3">
                  Live Confluence Engine
                </div>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Historical Depth</span>
                    <span className="text-white font-semibold">10 Years (2016–2026)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Synodic Filter</span>
                    <span className="text-[#10B981] font-semibold">Shukla / Krishna Ekadashi</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Execution Target</span>
                    <span className="text-white font-semibold">1:2.5 Min R:R Ratio</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Price Ingestion</span>
                    <span className="text-[#06B6D4] font-semibold">Real-Time Upstox V3 LTP</span>
                  </div>
                </div>

                <Link
                  to={terminalUrl}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#E5B869]/40 bg-[#E5B869]/10 text-xs font-bold text-[#E5B869] hover:bg-[#E5B869] hover:text-black transition"
                >
                  Explore ChronoWheel →
                </Link>
              </div>
            </div>
          </div>

          {/* Card 2: ICT Unicorn Multi-Asset Radar & SMT */}
          <div
            id="unicorn-radar"
            className="rounded-2xl border border-zinc-800 bg-[#0E1015] p-6 sm:p-8 lg:p-10 relative overflow-hidden group hover:border-[#06B6D4]/50 transition-all duration-300"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#06B6D4]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col lg:flex-row gap-8 items-start justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-2.5 rounded-xl border border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#06B6D4]">
                    <Radar size={24} />
                  </div>
                  <div>
                    <span className="text-[11px] font-mono text-[#06B6D4] uppercase tracking-wider font-semibold">
                      MODULE 02 • LIQUIDITY DISPLACEMENT
                    </span>
                    <h3 className="text-2xl font-bold text-white tracking-tight">
                      ICT Unicorn Multi-Asset Radar &amp; SMT Engine
                    </h3>
                  </div>
                </div>

                <p className="mt-4 text-sm text-zinc-300 leading-relaxed">
                  Monitors intraday liquidity purges across Indices, Commodities, and FX. Detects
                  the trifecta setup: Buy-side / Sell-side Liquidity Sweep + Market Structure Shift
                  (MSS) with displacement + Fair Value Gap (FVG) retest.
                </p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-xl border border-zinc-800 bg-[#08090C] p-3.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Flame size={14} className="text-[#06B6D4]" />
                      Smart Money Divergence (SMT)
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Cross-checks correlated asset pairs (Nifty 50 vs Bank Nifty; COMEX Gold vs
                      Silver) to reveal institutional accumulation before breakout.
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-[#08090C] p-3.5">
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Clock size={14} className="text-purple-400" />
                      Session Liquidity Windows
                    </div>
                    <div className="mt-1 text-xs text-zinc-400">
                      Identifies Asian session range accumulation, London Open runs, and New York
                      reversals with calibrated killzone alerts.
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-zinc-800 bg-zinc-900/60 text-zinc-300">
                    Liquidity Sweeps
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#06B6D4]">
                    Nifty vs BankNifty SMT
                  </span>
                  <span className="px-2.5 py-1 rounded-md text-[11px] font-mono border border-zinc-800 bg-zinc-900/60 text-zinc-300">
                    COMEX GC1! vs SI1!
                  </span>
                </div>
              </div>

              <div className="w-full lg:w-80 rounded-xl border border-[#06B6D4]/20 bg-[#08090C] p-5 shrink-0">
                <div className="text-xs font-mono text-[#06B6D4] uppercase tracking-wider mb-3">
                  SMT Divergence State
                </div>
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Index Pair</span>
                    <span className="text-white font-semibold">NIFTY / BANKNIFTY</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Displacement State</span>
                    <span className="text-[#10B981] font-semibold">Bullish FVG Retest</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Commodity Pair</span>
                    <span className="text-white font-semibold">GOLD / SILVER (GC/SI)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-zinc-800/80">
                    <span className="text-zinc-400">Execution Mode</span>
                    <span className="text-[#E5B869] font-semibold">Unicorn Confluence</span>
                  </div>
                </div>

                <Link
                  to={terminalUrl}
                  className="mt-5 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-[#06B6D4]/40 bg-[#06B6D4]/10 text-xs font-bold text-[#06B6D4] hover:bg-[#06B6D4] hover:text-black transition"
                >
                  Open Unicorn Radar →
                </Link>
              </div>
            </div>
          </div>

          {/* 3-Card Grid for Remaining Engines */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 3: Gann Square of 9 */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0E1015] p-6 relative overflow-hidden hover:border-[#E5B869]/40 transition duration-300">
              <div className="p-2.5 w-fit rounded-xl border border-[#E5B869]/30 bg-[#E5B869]/10 text-[#E5B869] mb-4">
                <Compass size={22} />
              </div>
              <span className="text-[10px] font-mono text-[#E5B869] uppercase tracking-wider font-semibold">
                MODULE 03 • GEOMETRIC OCTAVES
              </span>
              <h3 className="text-xl font-bold text-white mt-1">Gann Square of 9 &amp; Harmonics</h3>
              <p className="mt-3 text-xs text-zinc-300 leading-relaxed">
                Utilizes Swiss Ephemeris mathematical formulas to compute planetary degrees and
                aspect alignments (trine, square, opposition). Maps price levels directly onto 45°,
                90°, 180°, and 360° circular spirals to anticipate intraday reversal pivots.
              </p>
              <div className="mt-5 pt-4 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Aspect Accuracy:</span>
                  <span className="text-white font-semibold">Within ±3 Minutes</span>
                </div>
                <div className="flex justify-between">
                  <span>Coordinate Engine:</span>
                  <span className="text-[#E5B869] font-semibold">Vedic &amp; Western Astro</span>
                </div>
              </div>
            </div>

            {/* Card 4: Derivatives & GEX Lab */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0E1015] p-6 relative overflow-hidden hover:border-[#10B981]/40 transition duration-300">
              <div className="p-2.5 w-fit rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981] mb-4">
                <BarChart3 size={22} />
              </div>
              <span className="text-[10px] font-mono text-[#10B981] uppercase tracking-wider font-semibold">
                MODULE 04 • DEALER POSITIONING
              </span>
              <h3 className="text-xl font-bold text-white mt-1">Derivatives &amp; GEX Lab</h3>
              <p className="mt-3 text-xs text-zinc-300 leading-relaxed">
                Live dealer Net Gamma Exposure (GEX) tracking zero-gamma inflection zones. Combines
                live Option Chain Put-Call Ratio (PCR), Max Pain migration, and Fixed Range Volume
                Profile (FRVP) Point of Control (POC) to anticipate dealer hedging squeezes.
              </p>
              <div className="mt-5 pt-4 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Gamma Flip Detection:</span>
                  <span className="text-white font-semibold">Real-Time Strike Shift</span>
                </div>
                <div className="flex justify-between">
                  <span>Volume Engine:</span>
                  <span className="text-[#10B981] font-semibold">FRVP Volume Nodes</span>
                </div>
              </div>
            </div>

            {/* Card 5: AI Trade Synthesizer */}
            <div className="rounded-2xl border border-zinc-800 bg-[#0E1015] p-6 relative overflow-hidden hover:border-purple-500/40 transition duration-300">
              <div className="p-2.5 w-fit rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-400 mb-4">
                <Cpu size={22} />
              </div>
              <span className="text-[10px] font-mono text-purple-400 uppercase tracking-wider font-semibold">
                MODULE 05 • RISK ALLOCATION
              </span>
              <h3 className="text-xl font-bold text-white mt-1">EagleBABA AI Trade Synthesizer</h3>
              <p className="mt-3 text-xs text-zinc-300 leading-relaxed">
                Automated trade sizing engine calculating precise lot and quantity allocation based
                on strict 1%–2% invariant account capital preservation. Fuses lunar timing, order
                flow imbalance, and volatility into actionable institutional execution cards.
              </p>
              <div className="mt-5 pt-4 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400 space-y-1.5">
                <div className="flex justify-between">
                  <span>Risk Parameter:</span>
                  <span className="text-white font-semibold">1% Invariant Sizing</span>
                </div>
                <div className="flex justify-between">
                  <span>Discretion Level:</span>
                  <span className="text-purple-400 font-semibold">0% Non-Discretionary</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: EAGLEBABA EDGE VS TRADITIONAL TOOLS ── */}
      <section className="py-20 bg-[#0E1015]/60 border-y border-[#E5B869]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="text-xs font-mono text-[#E5B869] uppercase tracking-widest font-semibold">
              PARADIGM SHIFT
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-2">
              EagleBABA Edge vs Conventional Retail Tools
            </h2>
            <p className="mt-3 text-zinc-400 text-sm">
              Why traditional retail indicators fail in modern algorithmic markets and how
              quantitative ephemerides deliver an unfair edge.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-[#08090C] shadow-2xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-[#0E1015] font-mono uppercase text-zinc-400 text-[11px]">
                  <th className="py-4 px-6 font-semibold">Analytical Dimension</th>
                  <th className="py-4 px-6 font-semibold text-rose-400/90">
                    Conventional Retail Trading
                  </th>
                  <th className="py-4 px-6 font-semibold text-[#E5B869]">
                    EagleBABA Institutional Workstation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 font-sans">
                <tr className="hover:bg-zinc-900/40 transition">
                  <td className="py-4 px-6 font-semibold text-white">Time Dimension</td>
                  <td className="py-4 px-6 text-zinc-400 flex items-center gap-2">
                    <X size={15} className="text-rose-500 shrink-0" />
                    Static Gregorian calendar dates &amp; arbitrary 14-period lagging bars
                  </td>
                  <td className="py-4 px-6 text-emerald-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-[#10B981] shrink-0" />
                      Dynamic 10-year synodic Lunar cycles &amp; Gregorian shift compensation
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-zinc-900/40 transition">
                  <td className="py-4 px-6 font-semibold text-white">Order Flow Tracking</td>
                  <td className="py-4 px-6 text-zinc-400 flex items-center gap-2">
                    <X size={15} className="text-rose-500 shrink-0" />
                    Lagging MACD/RSI crossovers prone to false whipsaws
                  </td>
                  <td className="py-4 px-6 text-emerald-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-[#10B981] shrink-0" />
                      ICT Unicorn sweeps, displacement MSS, FVG retests &amp; SMT divergence
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-zinc-900/40 transition">
                  <td className="py-4 px-6 font-semibold text-white">Price Geometry</td>
                  <td className="py-4 px-6 text-zinc-400 flex items-center gap-2">
                    <X size={15} className="text-rose-500 shrink-0" />
                    Subjective chart patterns (head &amp; shoulders, double tops)
                  </td>
                  <td className="py-4 px-6 text-emerald-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-[#10B981] shrink-0" />
                      Gann Square of 9 octaves + Swiss Ephemeris astronomical degrees
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-zinc-900/40 transition">
                  <td className="py-4 px-6 font-semibold text-white">Derivatives Modeling</td>
                  <td className="py-4 px-6 text-zinc-400 flex items-center gap-2">
                    <X size={15} className="text-rose-500 shrink-0" />
                    Static open interest graphs without dealer delta/gamma hedging context
                  </td>
                  <td className="py-4 px-6 text-emerald-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-[#10B981] shrink-0" />
                      Aggregate Net GEX curves, Zero-Gamma flip levels &amp; Volume Profile POC
                    </div>
                  </td>
                </tr>

                <tr className="hover:bg-zinc-900/40 transition">
                  <td className="py-4 px-6 font-semibold text-white">Risk &amp; Execution</td>
                  <td className="py-4 px-6 text-zinc-400 flex items-center gap-2">
                    <X size={15} className="text-rose-500 shrink-0" />
                    Emotional sizing, revenge trading, and arbitrary round-number stop-losses
                  </td>
                  <td className="py-4 px-6 text-emerald-400 font-medium">
                    <div className="flex items-center gap-2">
                      <Check size={16} className="text-[#10B981] shrink-0" />
                      Strict 1% invariant risk math with official NSE lot sizes &amp; automated TP targets
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: ENTERPRISE SECURITY & ARCHITECTURE RIBBON ── */}
      <section id="security" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div id="architecture" className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#06B6D4]/30 bg-[#06B6D4]/10 text-[#06B6D4] text-xs font-mono uppercase tracking-widest mb-3">
            ENTERPRISE ARCHITECTURE &amp; ZERO-TRUST SECURITY
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Institutional Infrastructure &amp; Data Isolation
          </h2>
          <p className="mt-3 text-zinc-400 text-sm">
            Hardened on Hostinger KVM 4 VPS with host-level UFW firewalls, Docker network isolation,
            and zero external cloud dependencies.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-xl border border-zinc-800 bg-[#0E1015] p-5 hover:border-[#E5B869]/40 transition">
            <div className="p-2.5 w-fit rounded-lg bg-[#E5B869]/10 text-[#E5B869] mb-3">
              <ShieldCheck size={22} />
            </div>
            <h4 className="text-sm font-bold text-white">Zero-Trust HTTP Hardening</h4>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Strict HSTS Preload (63,072,000s), Frame-Ancestors 'none', X-Content-Type-Options
              'nosniff', and strict Content Security Policies.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#0E1015] p-5 hover:border-[#06B6D4]/40 transition">
            <div className="p-2.5 w-fit rounded-lg bg-[#06B6D4]/10 text-[#06B6D4] mb-3">
              <Activity size={22} />
            </div>
            <h4 className="text-sm font-bold text-white">Sliding-Window Rate Limiting</h4>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              In-memory sliding window rate-limiting middleware guarding all endpoints against
              scraping, abuse, and DDoS bursts.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#0E1015] p-5 hover:border-[#10B981]/40 transition">
            <div className="p-2.5 w-fit rounded-lg bg-[#10B981]/10 text-[#10B981] mb-3">
              <Radio size={22} />
            </div>
            <h4 className="text-sm font-bold text-white">Upstox V3 &amp; CoinDCX WebSockets</h4>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Direct binary WebSocket pipelines for 200+ NSE contracts and 24/7 CoinDCX crypto
              streaming with sub-millisecond local caching.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#0E1015] p-5 hover:border-purple-500/40 transition">
            <div className="p-2.5 w-fit rounded-lg bg-purple-500/10 text-purple-400 mb-3">
              <Server size={22} />
            </div>
            <h4 className="text-sm font-bold text-white">UFW &amp; Fail2ban Host Defense</h4>
            <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
              Default-DENY UFW rules, isolated DOCKER-USER chains blocking internal database ports,
              and automated fail2ban IP brute-force protection.
            </p>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: FINAL CALL TO ACTION ── */}
      <section className="py-20 relative overflow-hidden border-t border-[#E5B869]/15 bg-gradient-to-b from-[#0E1015] to-[#08090C]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(229,184,105,0.08),transparent_70%)] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <img
            src="/images/eaglebaba_logo1.png"
            alt="EagleBABA"
            className="mx-auto w-14 h-14 rounded-2xl object-contain mb-6"
          />
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Ready to Experience Institutional Precision?
          </h2>
          <p className="mt-4 text-base text-zinc-300 max-w-2xl mx-auto">
            Step into the non-discretionary workstation engineered for modern Indian derivative
            markets.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={terminalUrl}
              className="inline-flex items-center gap-2.5 px-9 py-4 rounded-xl text-sm font-bold uppercase tracking-wider bg-gradient-to-r from-[#E5B869] via-[#F3CE85] to-[#C99738] text-black shadow-[0_0_35px_rgba(229,184,105,0.45)] hover:shadow-[0_0_50px_rgba(229,184,105,0.7)] transition-all transform hover:-translate-y-0.5"
            >
              <Zap size={18} className="fill-black stroke-black" />
              Launch Trading Terminal
            </Link>
          </div>
        </div>
      </section>

      {/* ── SECTION 6: INSTITUTIONAL FOOTER ── */}
      <footer className="border-t border-zinc-800/80 bg-[#07080B] pt-14 pb-12 text-zinc-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-12 border-b border-zinc-800/60">
            {/* Col 1: Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                <img
                  src="/images/eaglebaba_logo1.png"
                  alt="EagleBABA"
                  className="w-8 h-8 rounded-lg object-contain"
                />
                <span className="font-bold text-base text-white tracking-wider">EagleBABA</span>
              </div>
              <p className="mt-3 text-zinc-400 text-xs leading-relaxed max-w-md">
                Institutional quantitative research workstation combining Vedic &amp; Western
                planetary ephemerides, dynamic lunar synodic cycles, and Smart Money Order Flow
                analytics.
              </p>
            </div>

            {/* Col 2: Navigation */}
            <div>
              <div className="font-mono uppercase text-white font-semibold tracking-wider text-[11px] mb-3">
                Workstation Modules
              </div>
              <ul className="space-y-2">
                <li>
                  <Link to="/chronowheel" className="hover:text-[#E5B869] transition">
                    ChronoWheel (Gann Cycles)
                  </Link>
                </li>
                <li>
                  <Link to="/unicorn-radar" className="hover:text-[#E5B869] transition">
                    ICT Unicorn &amp; SMT Radar
                  </Link>
                </li>
                <li>
                  <Link to="/live-terminal" className="hover:text-[#E5B869] transition">
                    Live Order Flow Terminal
                  </Link>
                </li>
                <li>
                  <Link to="/live-chart" className="hover:text-[#E5B869] transition">
                    Live Chart &amp; FRVP
                  </Link>
                </li>
                <li>
                  <Link to="/astro" className="hover:text-[#E5B869] transition">
                    Astro Levels &amp; Octaves
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Legal & System */}
            <div>
              <div className="font-mono uppercase text-white font-semibold tracking-wider text-[11px] mb-3">
                System &amp; Regulatory
              </div>
              <ul className="space-y-2">
                <li>
                  <Link to="/status" className="hover:text-[#E5B869] transition">
                    System Health &amp; Uptime
                  </Link>
                </li>
                <li>
                  <Link to="/release-notes" className="hover:text-[#E5B869] transition">
                    Release Notes (v3.2)
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-[#E5B869] transition">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-[#E5B869] transition">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* SEBI Compliance & Risk Disclosure */}
          <div className="pt-8 space-y-4 text-[11px] text-zinc-500 leading-relaxed">
            <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30">
              <span className="font-semibold text-zinc-300 uppercase font-mono block mb-1">
                SEBI Regulatory &amp; Research Disclaimer
              </span>
              EagleBABA is an advanced financial analytics and mathematical research software
              platform designed solely for educational, informational, and quantitative research
              purposes. EagleBABA is NOT a SEBI-registered investment advisor, research analyst, or
              portfolio manager. Nothing contained on this platform constitutes investment, legal,
              or tax advice, nor should it be construed as an offer, recommendation, or solicitation
              to buy, sell, or hold any security, derivative contract, or commodity.
            </div>

            <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30">
              <span className="font-semibold text-zinc-300 uppercase font-mono block mb-1">
                SEBI Risk Disclosure on Derivatives (F&amp;O Trading)
              </span>
              Trading in Futures &amp; Options carries high market risk. As per SEBI study: 9 out of
              10 individual traders in equity Futures and Options Segment incurred net losses. On an
              average, loss makers registered net trading loss close to ₹50,000. Over and above the
              net trading losses incurred, loss makers expended an additional 28% of net trading
              losses as transaction costs. Past performance is no guarantee of future returns.
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-zinc-900 text-zinc-600 text-[10px] font-mono">
              <div>
                © {new Date().getFullYear()} EagleBABA Quantitative Platform. All rights reserved.
              </div>
              <div className="mt-2 sm:mt-0 flex gap-4">
                <span>Production Server: 200.234.35.116</span>
                <span>•</span>
                <span>Zero Cloud Isolation</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
