// Institutional Research Deck: Volume Profile (FRVP) & Order Flow Analytics
// Displays Active Shape (P-Shape / b-Shape / D-Shape), HVN magnets, LVN breakout voids,
// live Spot vs POC deviation, and order flow execution signals.

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  computeVolumeProfile,
  getDefaultBinSize,
  type OrderFlowCandle,
  type OrderFlowSymbol,
  type VolumeProfileResult,
} from "@/lib/orderflow/volume-profile-engine";
import {
  generateVolumeProfileSignals,
  type VolumeProfileSignal,
} from "@/lib/orderflow/volume-profile-signals";
import { dispatchVolumeProfileAlert } from "@/lib/smart-alerts/persistence.functions";
import {
  getUnicornRadar,
  getSMTDivergence,
  type UnicornSetup,
  type SMTDivergence,
} from "@/lib/orderflow/unicorn.functions";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Compass,
  Crosshair,
  ExternalLink,
  Layers,
  Magnet,
  Maximize2,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

interface InstrumentOption {
  readonly id: OrderFlowSymbol;
  readonly label: string;
  readonly defaultPrice: number;
  readonly tickSize: number;
  readonly currency: string;
}

const INSTRUMENTS: readonly InstrumentOption[] = [
  { id: "NIFTY50", label: "NIFTY 50", defaultPrice: 24520, tickSize: 5.0, currency: "₹" },
  { id: "BANKNIFTY", label: "BANK NIFTY", defaultPrice: 52400, tickSize: 10.0, currency: "₹" },
  { id: "SENSEX", label: "BSE SENSEX", defaultPrice: 80250, tickSize: 10.0, currency: "₹" },
  { id: "GC1!", label: "COMEX GOLD (GC1!)", defaultPrice: 2742.5, tickSize: 0.5, currency: "$" },
];

interface InstitutionalResearchDeckProps {
  readonly activeSymbol?: OrderFlowSymbol;
  readonly livePrice?: number | null;
  readonly candles?: readonly OrderFlowCandle[];
  readonly className?: string;
}

export function InstitutionalResearchDeck({
  activeSymbol = "NIFTY50",
  livePrice,
  candles,
  className = "",
}: InstitutionalResearchDeckProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<OrderFlowSymbol>(activeSymbol);
  const [activeTab, setActiveTab] = useState<"profile" | "signals" | "levels" | "radar">("profile");
  const [radarCategory, setRadarCategory] = useState<string>("ALL");
  const [dispatchStatus, setDispatchStatus] = useState<Record<string, "idle" | "sending" | "sent" | "error">>({});

  const fetchUnicorn = useServerFn(getUnicornRadar);
  const fetchSMT = useServerFn(getSMTDivergence);

  const { data: radarSetups = [] } = useQuery<UnicornSetup[]>({
    queryKey: ["unicorn-radar-signals"],
    queryFn: () => fetchUnicorn(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: smtDivergences = [] } = useQuery<SMTDivergence[]>({
    queryKey: ["smt-divergence-signals"],
    queryFn: () => fetchSMT(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  const filteredRadarSetups = useMemo(() => {
    if (radarCategory === "ALL") return radarSetups;
    return radarSetups.filter((s) => s.category === radarCategory);
  }, [radarSetups, radarCategory]);

  const currentInstrument = INSTRUMENTS.find((i) => i.id === selectedSymbol) ?? INSTRUMENTS[0];
  const spotPrice = livePrice != null && selectedSymbol === activeSymbol ? livePrice : currentInstrument.defaultPrice;

  // Generate synthetic candles if real candle stream is not yet hydrated
  const effectiveCandles: readonly OrderFlowCandle[] = useMemo(() => {
    if (candles && candles.length > 5 && selectedSymbol === activeSymbol) {
      return candles;
    }

    // High-fidelity fallback intraday session candles (09:15 to current)
    const seed: OrderFlowCandle[] = [];
    const basePrice = currentInstrument.defaultPrice;
    const now = Date.now();
    const tick = currentInstrument.tickSize;

    // Simulate 45 5-minute intraday candles
    let currentOpen = basePrice - tick * 12;
    for (let i = 0; i < 45; i++) {
      const isTopCluster = i > 25;
      const drift = isTopCluster ? tick * 0.8 : tick * 0.2;
      const open = currentOpen;
      const high = open + Math.abs(Math.sin(i * 0.4)) * tick * 4 + tick;
      const low = open - Math.abs(Math.cos(i * 0.3)) * tick * 3;
      const close = (open + high + low) / 3;
      currentOpen = close + drift;

      // Heavy volume at the highs to demonstrate P-shape/acceptance
      const volume = isTopCluster ? 8500 + (i % 5) * 1200 : 1800 + (i % 7) * 400;

      seed.push({
        time: now - (45 - i) * 300_000,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      });
    }
    return seed;
  }, [candles, selectedSymbol, activeSymbol, currentInstrument]);

  // Compute Volume Profile (FRVP)
  const profile: VolumeProfileResult = useMemo(() => {
    return computeVolumeProfile(effectiveCandles, {
      symbol: selectedSymbol,
      binSize: getDefaultBinSize(selectedSymbol),
    });
  }, [effectiveCandles, selectedSymbol]);

  // Compute Execution Signals
  const signals: readonly VolumeProfileSignal[] = useMemo(() => {
    return generateVolumeProfileSignals(profile, effectiveCandles);
  }, [profile, effectiveCandles]);

  // Deviation from POC
  const pocDeviationPts = spotPrice - profile.poc;
  const pocDeviationPct = profile.poc > 0 ? (pocDeviationPts / profile.poc) * 100 : 0;

  // Nearest HVN magnet & LVN breakout zone
  const nearestHvn = useMemo(() => {
    if (profile.hvns.length === 0) return null;
    return [...profile.hvns].sort(
      (a, b) => Math.abs(a.price - spotPrice) - Math.abs(b.price - spotPrice)
    )[0];
  }, [profile.hvns, spotPrice]);

  const nearestLvn = useMemo(() => {
    if (profile.lvns.length === 0) return null;
    return [...profile.lvns].sort(
      (a, b) => Math.abs(a.price - spotPrice) - Math.abs(b.price - spotPrice)
    )[0];
  }, [profile.lvns, spotPrice]);

  const handleDispatchTelegram = async (signal: VolumeProfileSignal) => {
    setDispatchStatus((prev) => ({ ...prev, [signal.id]: "sending" }));
    try {
      const res = await dispatchVolumeProfileAlert({ data: signal });
      if (res.ok) {
        setDispatchStatus((prev) => ({ ...prev, [signal.id]: "sent" }));
      } else {
        setDispatchStatus((prev) => ({ ...prev, [signal.id]: "error" }));
      }
    } catch {
      setDispatchStatus((prev) => ({ ...prev, [signal.id]: "error" }));
    }
  };

  return (
    <div
      className={`rounded-2xl border border-amber-500/25 bg-zinc-950/70 backdrop-blur-xl p-4 sm:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.85)] ${className}`}
    >
      {/* Header & Instrument Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
            <h2 className="text-base sm:text-lg font-bold font-mono text-zinc-100 tracking-wide flex items-center gap-2">
              INSTITUTIONAL FIXED RANGE VOLUME PROFILE (FRVP)
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            Session Order Flow Matrix · POC Magnetism · Value Area (70%) · HVN/LVN Liquidity Voids
          </p>
        </div>

        {/* Instrument Selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {INSTRUMENTS.map((inst) => {
            const active = inst.id === selectedSymbol;
            return (
              <button
                key={inst.id}
                onClick={() => setSelectedSymbol(inst.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  active
                    ? "bg-amber-500 text-black border border-amber-400 shadow-[0_0_15px_-3px_rgba(245,158,11,0.5)]"
                    : "text-zinc-400 hover:text-zinc-100 bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700"
                }`}
              >
                {inst.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mt-4 border-b border-zinc-800/60 pb-2">
        <button
          onClick={() => setActiveTab("profile")}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
            activeTab === "profile"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Volume Profile & Shape
        </button>
        <button
          onClick={() => setActiveTab("signals")}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === "signals"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span>Order Flow Signals</span>
          {signals.length > 0 && (
            <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full border border-emerald-500/40 font-bold">
              {signals.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("levels")}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
            activeTab === "levels"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          HVN & LVN Grid
        </button>
        <button
          onClick={() => setActiveTab("radar")}
          className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === "radar"
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span>🦄 ICT Unicorn Radar & SMT</span>
          {radarSetups.length > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] rounded-full border border-amber-500/40 font-bold">
              {radarSetups.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Profile & Shape */}
      {activeTab === "profile" && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Top Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Shape Classifier Card */}
            <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-3.5 flex flex-col justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Compass size={13} className="text-amber-400" />
                Profile Shape
              </span>
              <div className="my-2">
                <span
                  className={`text-sm sm:text-base font-bold font-mono px-2.5 py-1 rounded-lg border ${
                    profile.shapeBias === "BULLISH"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                      : profile.shapeBias === "BEARISH"
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                        : "bg-amber-500/15 border-amber-500/40 text-amber-300"
                  }`}
                >
                  {profile.shapeLabel}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                POC Position: {(profile.relativePocPosition * 100).toFixed(0)}% of range
              </div>
            </div>

            {/* Live POC Card */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Magnet size={13} className="text-amber-400" />
                Point of Control (POC)
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-amber-300 my-1">
                {currentInstrument.currency}
                {profile.poc.toLocaleString()}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-zinc-400">Deviation:</span>
                <span
                  className={`font-semibold ${
                    pocDeviationPts >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {pocDeviationPts >= 0 ? "+" : ""}
                  {pocDeviationPts.toFixed(1)} ({pocDeviationPct >= 0 ? "+" : ""}
                  {pocDeviationPct.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Value Area (70%) Card */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={13} className="text-zinc-400" />
                Value Area (70%)
              </span>
              <div className="flex items-baseline justify-between my-1">
                <div>
                  <span className="text-[10px] font-mono text-zinc-500 block">VAL (Low)</span>
                  <span className="text-sm font-bold font-mono text-zinc-200">
                    {currentInstrument.currency}
                    {profile.val.toLocaleString()}
                  </span>
                </div>
                <div className="text-zinc-600 font-mono text-xs">⟷</div>
                <div>
                  <span className="text-[10px] font-mono text-zinc-500 block text-right">VAH (High)</span>
                  <span className="text-sm font-bold font-mono text-zinc-200 text-right block">
                    {currentInstrument.currency}
                    {profile.vah.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                VA Volume: {profile.valueAreaPercentage}% of session
              </div>
            </div>

            {/* Nearest HVN / LVN Card */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 flex flex-col justify-between hover:border-amber-500/40 transition-colors">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap size={13} className="text-cyan-400" />
                Nearest Order Flow Nodes
              </span>
              <div className="space-y-1 my-1 text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-400">HVN Magnet:</span>
                  <span className="text-zinc-200 font-semibold">
                    {nearestHvn ? `${currentInstrument.currency}${nearestHvn.price.toFixed(1)}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cyan-400">LVN Void:</span>
                  <span className="text-zinc-200 font-semibold">
                    {nearestLvn ? `${currentInstrument.currency}${nearestLvn.price.toFixed(1)}` : "—"}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-zinc-400 font-mono">
                Spot: {currentInstrument.currency}
                {spotPrice.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Profile Summary & Relative POC Position Bar */}
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/40 p-3.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Day Range: {currentInstrument.currency}{profile.minPrice.toLocaleString()} – {currentInstrument.currency}{profile.maxPrice.toLocaleString()}</span>
              <span className="text-amber-400 font-semibold">{profile.summary}</span>
            </div>
            {/* Visual Bar */}
            <div className="h-2 w-full bg-zinc-800/80 rounded-full overflow-hidden relative">
              {/* Value Area Band */}
              <div
                className="absolute top-0 bottom-0 bg-amber-500/30"
                style={{
                  left: `${profile.range > 0 ? ((profile.val - profile.minPrice) / profile.range) * 100 : 20}%`,
                  width: `${profile.range > 0 ? ((profile.vah - profile.val) / profile.range) * 100 : 60}%`,
                }}
              />
              {/* POC Marker */}
              <div
                className="absolute top-0 bottom-0 w-2 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,1)]"
                style={{
                  left: `${profile.range > 0 ? ((profile.poc - profile.minPrice) / profile.range) * 100 : 50}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-zinc-500">
              <span>Low: {profile.minPrice}</span>
              <span className="text-amber-400 font-semibold">POC: {profile.poc}</span>
              <span>High: {profile.maxPrice}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Execution Signals */}
      {activeTab === "signals" && (
        <div className="mt-4 flex flex-col gap-3">
          {signals.length === 0 ? (
            <div className="text-center py-8 rounded-xl border border-zinc-800 bg-zinc-900/30 text-zinc-400 text-xs font-mono">
              No active order flow breakout or liquidity sweep triggers detected on the current candle.
              Awaiting confirmed candle close near key nodes.
            </div>
          ) : (
            signals.map((sig) => {
              const status = dispatchStatus[sig.id] ?? "idle";
              const isBull = sig.direction === "BULLISH";
              return (
                <div
                  key={sig.id}
                  className={`rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                    isBull
                      ? "border-emerald-500/35 bg-emerald-950/15 shadow-[0_4px_20px_rgba(16,185,129,0.08)]"
                      : "border-rose-500/35 bg-rose-950/15 shadow-[0_4px_20px_rgba(244,63,94,0.08)]"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                          isBull
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                            : "bg-rose-500/20 text-rose-300 border-rose-500/50"
                        }`}
                      >
                        {sig.direction}
                      </span>
                      <span className="text-xs font-mono text-zinc-400 font-bold">{sig.type}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-zinc-800/80 text-zinc-300 rounded">
                        {sig.confirmation.candleType} ({sig.confirmation.volumeSurgeRatio}x Vol)
                      </span>
                    </div>

                    <h3 className="text-sm font-bold font-mono text-zinc-100">{sig.headline}</h3>
                    <p className="text-xs text-zinc-400">{sig.description}</p>

                    <div className="flex items-center gap-3 pt-1 text-xs font-mono">
                      <span className="text-zinc-400">
                        Trigger: <strong className="text-zinc-200">{sig.triggerLevel}</strong>
                      </span>
                      <span className="text-zinc-400">
                        Target: <strong className="text-emerald-400">{sig.targetPrice}</strong>
                      </span>
                      <span className="text-zinc-400">
                        Stop: <strong className="text-rose-400">{sig.stopLoss}</strong>
                      </span>
                      <span className="text-zinc-400">
                        R:R: <strong className="text-amber-400">{sig.riskRewardRatio}:1</strong>
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => handleDispatchTelegram(sig)}
                      disabled={status === "sending" || status === "sent"}
                      className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                        status === "sent"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : status === "sending"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                            : "bg-zinc-900 hover:bg-amber-500/20 text-zinc-200 hover:text-amber-300 border border-zinc-700 hover:border-amber-500/50"
                      }`}
                    >
                      <Send size={13} />
                      <span>
                        {status === "sent"
                          ? "Dispatched"
                          : status === "sending"
                            ? "Dispatching..."
                            : status === "error"
                              ? "Retry Telegram"
                              : "Telegram Alert"}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: HVN & LVN Grid */}
      {activeTab === "levels" && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* HVN Column */}
          <div className="rounded-xl border border-emerald-500/25 bg-zinc-900/40 p-4">
            <h3 className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              HIGH VOLUME NODES (HVN) — LIQUIDITY MAGNETS & ACCEPTANCE
            </h3>
            <div className="space-y-2">
              {profile.hvns.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs font-mono"
                >
                  <span className="text-zinc-200 font-bold">
                    {currentInstrument.currency}
                    {h.price.toFixed(1)}
                  </span>
                  <span className="text-zinc-400">{h.volume.toLocaleString()} units</span>
                  <span className="text-emerald-400 text-[10px]">
                    {Math.abs(h.price - spotPrice).toFixed(1)} pts away
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* LVN Column */}
          <div className="rounded-xl border border-cyan-500/25 bg-zinc-900/40 p-4">
            <h3 className="text-xs font-mono font-bold text-cyan-400 flex items-center gap-2 mb-3">
              <span className="h-2 w-2 rounded-full bg-cyan-400" />
              LOW VOLUME NODES (LVN) — VELOCITY VOIDS & BREAKOUT ZONES
            </h3>
            <div className="space-y-2">
              {profile.lvns.length === 0 ? (
                <div className="text-xs text-zinc-500 font-mono py-4 text-center">
                  No pronounced LVN liquidity voids detected in current range.
                </div>
              ) : (
                profile.lvns.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs font-mono"
                  >
                    <span className="text-zinc-200 font-bold">
                      {currentInstrument.currency}
                      {l.price.toFixed(1)}
                    </span>
                    <span className="text-zinc-400">{l.volume.toLocaleString()} units</span>
                    <span className="text-cyan-400 text-[10px]">
                      {Math.abs(l.price - spotPrice).toFixed(1)} pts away
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: ICT Unicorn Radar & SMT Divergence */}
      {activeTab === "radar" && (
        <div className="mt-4 flex flex-col gap-6">
          {/* Top SMT Divergence Correlation Monitor */}
          <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3 mb-3">
              <div>
                <h3 className="text-xs sm:text-sm font-mono font-bold text-amber-300 flex items-center gap-2">
                  <Radio size={14} className="text-amber-400 animate-pulse" />
                  SMT DIVERGENCE CORRELATION MONITOR (INSTITUTIONAL CRACKS)
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                  Synchronous structural swing cracks between correlated asset pairs · Smart Money accumulation & distribution
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 self-start sm:self-auto">
                {smtDivergences.length} ACTIVE SMT CORRELATIONS
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {smtDivergences.map((smt) => {
                const isBullish = smt.type === "BULLISH_SMT";
                return (
                  <div
                    key={smt.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 flex flex-col justify-between hover:border-amber-500/40 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="text-xs font-mono font-bold text-zinc-200">
                          {smt.pairName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {smt.timeframe}
                        </span>
                      </div>

                      <div className="mb-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                            isBullish
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                              : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                          }`}
                        >
                          {isBullish ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {isBullish ? "BULLISH SMT DIVERGENCE" : "BEARISH SMT DIVERGENCE"}
                        </span>
                      </div>

                      <div className="space-y-1 text-[11px] font-mono bg-zinc-900/60 p-2 rounded border border-zinc-800/80 mb-2">
                        <div className="flex justify-between items-center text-zinc-300">
                          <span>{smt.asset1.name}:</span>
                          <span className="font-bold text-amber-300">
                            {smt.asset1.swingType} (₹{smt.asset1.swingBPrice.toLocaleString()})
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-zinc-300">
                          <span>{smt.asset2.name}:</span>
                          <span
                            className={`font-bold ${
                              isBullish ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {smt.asset2.swingType} (₹{smt.asset2.swingBPrice.toLocaleString()})
                          </span>
                        </div>
                      </div>

                      <p className="text-[10px] text-zinc-400 font-mono leading-relaxed line-clamp-2">
                        {smt.summary}
                      </p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono">
                      <span className="text-zinc-500">{smt.targetLiquidity}</span>
                      <span className="text-amber-400 font-bold">
                        {smt.confidenceScore}% Confluence
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ICT Unicorn Algorithmic Scanner */}
          <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-4">
              <div>
                <h3 className="text-xs sm:text-sm font-mono font-bold text-amber-300 flex items-center gap-2">
                  <Sparkles size={14} className="text-amber-400" />
                  ICT UNICORN MULTI-ASSET RADAR (SWEEP + MSS + FVG RETEST)
                </h3>
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                  High-probability algorithmic setups across Indices, Sectors, 200+ F&O Equities, ETFs, and Commodities/Crypto
                </p>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: "ALL", label: `ALL (${radarSetups.length})` },
                  { id: "INDEX", label: `INDICES (${radarSetups.filter((s) => s.category === "INDEX").length})` },
                  { id: "SECTOR", label: `SECTORS (${radarSetups.filter((s) => s.category === "SECTOR").length})` },
                  { id: "FO_EQUITY", label: `F&O (${radarSetups.filter((s) => s.category === "FO_EQUITY").length})` },
                  { id: "ETF", label: `ETFS (${radarSetups.filter((s) => s.category === "ETF").length})` },
                  { id: "COMMODITY_CRYPTO", label: `COMMODITY/CRYPTO (${radarSetups.filter((s) => s.category === "COMMODITY_CRYPTO").length})` },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setRadarCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
                      radarCategory === cat.id
                        ? "bg-amber-500 text-black border border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]"
                        : "text-zinc-400 hover:text-zinc-200 bg-zinc-950/60 border border-zinc-800"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Setups Table */}
            {filteredRadarSetups.length === 0 ? (
              <div className="py-8 text-center text-xs font-mono text-zinc-500">
                No active ICT Unicorn setups detected in the selected category.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Asset & TF</th>
                      <th className="py-2.5 px-3">Setup & Direction</th>
                      <th className="py-2.5 px-3">Trigger Zone (FVG)</th>
                      <th className="py-2.5 px-3">SL / Invalidation</th>
                      <th className="py-2.5 px-3">Target (ERL)</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredRadarSetups.map((setup) => {
                      const isBullish = setup.direction === "BULLISH";
                      return (
                        <tr
                          key={setup.id}
                          className="hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-100">
                                {setup.displayName}
                              </span>
                              <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                                {setup.timeframe}
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500">
                              {setup.symbol} · {setup.category}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                isBullish
                                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                                  : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                              }`}
                            >
                              {setup.direction}
                            </span>
                            <div className="text-[10px] text-zinc-400 mt-0.5">
                              {setup.sweepType} @ {setup.sweepLevel.toLocaleString()}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-amber-300 font-bold">
                              {setup.triggerZone.low.toLocaleString()} – {setup.triggerZone.high.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-rose-400">
                            {setup.invalidationSL.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="text-emerald-400 font-bold">
                              {setup.targetPrice.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-zinc-500 ml-1">
                              (1:{setup.riskRewardRatio.toFixed(1)} RR)
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                setup.status === "Triggered"
                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                  : setup.status === "Retest Ready"
                                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.3)] animate-pulse"
                                    : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                              }`}
                            >
                              {setup.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-400 text-[10px]">
                            {setup.timeElapsed}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <a
                              href={`/live-chart?symbol=${setup.symbol}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono font-medium rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                            >
                              Inspect Chart
                              <ExternalLink size={12} />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
