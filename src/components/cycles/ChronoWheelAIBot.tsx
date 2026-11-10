// Phase 36.5 — Built-in EagleBABA ChronoWheel AI Trade Assistant Drawer
// Slide-over AI chat assistant providing grounded astronomical cycle analysis, trade execution plans,
// invariant lot sizing, and derivatives risk assessment. Supports Gemini 1.5 Flash + deterministic fallback.

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Sparkles,
  Send,
  Bot,
  User,
  Orbit,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Layers,
  Sliders,
  RotateCcw,
  Copy,
  Check,
  Zap,
  Info,
} from "lucide-react";
import {
  queryChronoWheelAIFn,
  type ChronoWheelAIRequest,
  type ChronoWheelAIResponse,
  type StockCyclePerformance,
} from "@/lib/cycles/chronowheel.functions";

interface ChronoWheelAIBotProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly activeStock?: StockCyclePerformance | null;
  readonly cycleContext?: {
    readonly startDate: string;
    readonly endDate: string;
    readonly tithi: string;
    readonly phaseAngle: number;
    readonly phaseName: string;
    readonly lookbackYears: number;
  };
  readonly onClearStock?: () => void;
}

interface ChatMessage {
  readonly id: string;
  readonly sender: "user" | "assistant";
  readonly text: string;
  readonly structuredPlan?: ChronoWheelAIResponse["structuredTradePlan"];
  readonly bullets?: readonly string[];
  readonly modelUsed?: string;
  readonly timestamp: string;
}

export function ChronoWheelAIBot({
  isOpen,
  onClose,
  activeStock,
  cycleContext,
  onClearStock,
}: ChronoWheelAIBotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedPlan, setCopiedPlan] = useState<boolean>(false);

  // User capital & risk preferences
  const [capital, setCapital] = useState<number>(100000);
  const [riskPct, setRiskPct] = useState<number>(2.0);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize welcome message when drawer opens or stock changes
  useEffect(() => {
    if (!isOpen) return;

    if (activeStock) {
      const exec = activeStock.executionPlan;
      setMessages([
        {
          id: "welcome-stock",
          sender: "assistant",
          text: `### 🦅 ChronoWheel Quant AI: Ready to analyze **${activeStock.symbol}** (${activeStock.name})

- **10-Year Synodic Win Rate:** **${activeStock.winRate}%** (${activeStock.avgReturn > 0 ? "+" : ""}${activeStock.avgReturn.toFixed(2)}% Avg)
- **Institutional Bias:** \`${activeStock.confluenceBias}\`
- **Execution Zone:** Entry **₹${exec?.entryPrice.toFixed(2)}** • SL **₹${exec?.stopLoss.toFixed(2)}** • TP2 **₹${exec?.tp2.toFixed(2)}** (R:R ${exec?.riskRewardRatio})

Click any quick prompt below or type your question:`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } else {
      setMessages([
        {
          id: "welcome-general",
          sender: "assistant",
          text: `### 🦅 EagleBABA ChronoWheel AI Trade Assistant

I am your quantitative astronomical cycle assistant. I calculate exact **Moon-Sun synodic longitudinal separation angles** across T-1 to T-10 historical windows and generate invariant trade execution plans.

**Active Cycle Window:**
- Window: **${cycleContext?.startDate ?? "Current"} ➔ ${cycleContext?.endDate ?? "Session"}**
- Vedic Tithi: **${cycleContext?.tithi ?? "Dynamic Tithi"}** (Phase: ${cycleContext?.phaseAngle?.toFixed(1) ?? "0.0"}°)

Select any stock on the screener to generate custom lot sizing or ask me anything!`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    }
  }, [isOpen, activeStock, cycleContext]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Submit query handler
  const handleSendMessage = useCallback(
    async (queryText?: string) => {
      const query = (queryText ?? inputQuery).trim();
      if (!query || isLoading) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: "user",
        text: query,
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputQuery("");
      setIsLoading(true);

      try {
        const payload: ChronoWheelAIRequest = {
          query,
          stockContext: activeStock
            ? {
                symbol: activeStock.symbol,
                name: activeStock.name,
                sector: activeStock.sector,
                category: activeStock.category,
                beta: activeStock.beta,
                currentPrice: activeStock.currentPrice,
                winRate: activeStock.winRate,
                avgReturn: activeStock.avgReturn,
                volatility: activeStock.volatility,
                maxDrawdown: activeStock.maxDrawdown,
                confluenceBias: activeStock.confluenceBias,
                liveIv: activeStock.liveIv,
                ivPercentile: activeStock.ivPercentile,
                executionPlan: activeStock.executionPlan,
                hitRateSummary: activeStock.hitRateSummary,
              }
            : undefined,
          cycleContext: cycleContext
            ? {
                startDate: cycleContext.startDate,
                endDate: cycleContext.endDate,
                tithi: cycleContext.tithi,
                phaseAngle: cycleContext.phaseAngle,
                phaseName: cycleContext.phaseName,
                lookbackYears: cycleContext.lookbackYears,
              }
            : undefined,
          accountContext: {
            capital,
            riskPct,
          },
        };

        const res: ChronoWheelAIResponse = await queryChronoWheelAIFn({ data: payload });

        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "assistant",
          text: res.answer,
          structuredPlan: res.structuredTradePlan,
          bullets: res.bullets,
          modelUsed: res.modelUsed,
          timestamp: new Date().toLocaleTimeString(),
        };

        setMessages((prev) => [...prev, botMsg]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: "assistant",
            text: `⚠️ **AI Engine Notice:** ${err instanceof Error ? err.message : "Unable to reach AI assistant. Please try again."}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [inputQuery, isLoading, activeStock, cycleContext, capital, riskPct],
  );

  const handleCopyPlan = (plan: ChronoWheelAIResponse["structuredTradePlan"]) => {
    if (!plan) return;
    const planText = `EagleBABA ChronoWheel Trade Plan:
Symbol: ${activeStock?.symbol ?? "Stock"}
Direction: ${plan.direction}
Entry: ${plan.entry}
Hard SL: ${plan.sl}
TP1: ${plan.tp1} | TP2: ${plan.tp2} | TP3: ${plan.tp3}
R:R: ${plan.riskReward}
Position: ${plan.recommendedPosition}
Max Risk: ${plan.maxRiskAmount}`;

    navigator.clipboard.writeText(planText);
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-xl h-full bg-[#0a0c10] border-l border-amber-500/30 flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-zinc-900 border border-amber-500/30 text-amber-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  ChronoWheel AI Assistant
                </h3>
                <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ONLINE
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-mono">
                Grounded Lunar & Gann Risk Synthesizer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (activeStock) {
                  handleSendMessage("Generate trade plan for " + activeStock.symbol);
                }
              }}
              title="Reset or re-run analysis"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Active Context Banner */}
        <div className="px-4 py-2 bg-zinc-950/60 border-b border-zinc-800/80 flex items-center justify-between gap-2 text-xs font-mono">
          {activeStock ? (
            <div className="flex items-center gap-2 truncate">
              <span className="text-zinc-400">Active Stock:</span>
              <span className="font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                {activeStock.symbol}
              </span>
              <span className="text-zinc-500 truncate text-[11px] hidden sm:inline">
                ({activeStock.confluenceBias} • {activeStock.winRate}%)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-zinc-400">
              <Orbit className="w-3.5 h-3.5 text-amber-400" />
              <span>General Cycle: {cycleContext?.tithi ?? "Vedic Synodic Window"}</span>
            </div>
          )}

          {activeStock && onClearStock && (
            <button
              onClick={onClearStock}
              className="text-[11px] text-zinc-400 hover:text-rose-400 transition-colors flex items-center gap-1"
            >
              <span>Clear</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Portfolio Risk Preferences Bar */}
        <div className="px-4 py-2 bg-[#0d0f15] border-b border-zinc-800/60 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px]">Capital:</span>
              <span className="text-white font-bold">₹{capital.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400 text-[11px]">Risk:</span>
              <span className="text-amber-400 font-bold">{riskPct}%</span>
              <span className="text-zinc-500 text-[10px]">
                (₹{Math.round(capital * (riskPct / 100)).toLocaleString("en-IN")})
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              const newCap = window.prompt("Enter your trading capital (₹):", String(capital));
              if (newCap && !isNaN(Number(newCap))) {
                setCapital(Number(newCap));
              }
            }}
            className="text-[10px] text-amber-400 hover:text-amber-300 underline"
          >
            Adjust
          </button>
        </div>

        {/* Chat Messages Body */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((m) => {
            const isUser = m.sender === "user";
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? "bg-amber-500 text-black font-medium shadow-md shadow-amber-500/10"
                      : "bg-zinc-900/90 border border-zinc-800 text-zinc-200"
                  }`}
                >
                  <div className="whitespace-pre-line prose prose-invert prose-xs max-w-none">
                    {m.text}
                  </div>

                  {/* Render Structured Trade Plan Card if provided */}
                  {m.structuredPlan && (
                    <div className="mt-3.5 p-3 rounded-lg bg-black/60 border border-amber-500/30 space-y-2 font-mono text-xs">
                      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                        <span className="text-amber-300 font-bold flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-amber-400" />
                          STRUCTURED EXECUTION PLAN
                        </span>
                        <button
                          onClick={() => handleCopyPlan(m.structuredPlan)}
                          className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-300 transition-colors"
                        >
                          {copiedPlan ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedPlan ? "Copied!" : "Copy"}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-zinc-500 block">Action / Bias:</span>
                          <span
                            className={`font-bold ${
                              m.structuredPlan.direction === "LONG" ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {m.structuredPlan.direction}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Entry Level:</span>
                          <span className="text-white font-bold">{m.structuredPlan.entry}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Hard Stop Loss:</span>
                          <span className="text-rose-400 font-bold">{m.structuredPlan.sl}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Target 2 (+2.5R):</span>
                          <span className="text-emerald-400 font-bold">{m.structuredPlan.tp2}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Target 1 & 3:</span>
                          <span className="text-zinc-300">
                            TP1: {m.structuredPlan.tp1} | TP3: {m.structuredPlan.tp3}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500 block">Risk : Reward:</span>
                          <span className="text-purple-300 font-bold">{m.structuredPlan.riskReward}</span>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-zinc-800/80">
                          <span className="text-zinc-500 block">Recommended Invariant Sizing:</span>
                          <span className="text-amber-300 font-bold">
                            {m.structuredPlan.recommendedPosition} (Max Risk: {m.structuredPlan.maxRiskAmount})
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {m.modelUsed && (
                    <div className="mt-2 text-[10px] text-zinc-500 font-mono flex items-center justify-between">
                      <span>{m.modelUsed}</span>
                      <span>{m.timestamp}</span>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 flex-shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-3 items-center text-zinc-400 text-xs font-mono">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Orbit className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Synthesizing cycle harmonics & risk mathematics...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Action Chips */}
        <div className="p-2 border-t border-zinc-800/80 bg-zinc-950/70 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
          <button
            onClick={() => handleSendMessage("Generate trade plan with entry, stop loss, and targets")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[11px] font-mono text-amber-300 whitespace-nowrap transition-colors"
          >
            <Target className="w-3 h-3 text-amber-400" />
            <span>Generate Trade Plan</span>
          </button>

          <button
            onClick={() => handleSendMessage(`Calculate my lot size based on ₹${capital} capital and ${riskPct}% risk`)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[11px] font-mono text-zinc-300 hover:text-white whitespace-nowrap transition-colors"
          >
            <Shield className="w-3 h-3 text-purple-400" />
            <span>Calculate Lot Size</span>
          </button>

          <button
            onClick={() => handleSendMessage("Explain the lunar cycle and Gann angle mechanics behind this stock")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[11px] font-mono text-zinc-300 hover:text-white whitespace-nowrap transition-colors"
          >
            <Orbit className="w-3 h-3 text-blue-400" />
            <span>Lunar Resonance</span>
          </button>

          <button
            onClick={() => handleSendMessage("Check ATM Implied Volatility (IV) and recommend Call vs Spread strategy")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 text-[11px] font-mono text-zinc-300 hover:text-white whitespace-nowrap transition-colors"
          >
            <Sliders className="w-3 h-3 text-emerald-400" />
            <span>IV & Options Check</span>
          </button>
        </div>

        {/* Bottom Input Field */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center gap-2">
          <input
            type="text"
            placeholder={
              activeStock
                ? `Ask anything about ${activeStock.symbol} (e.g. lot size, SL, TP2)...`
                : "Ask about lunar cycles, Gann angles, or stock trade plans..."
            }
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 font-mono outline-none focus:border-amber-500/60 transition-colors"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputQuery.trim() || isLoading}
            className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold disabled:opacity-40 transition-colors shadow-md shadow-amber-500/20"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}