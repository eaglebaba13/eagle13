// Phase 19 — Paper Trading Engine (pure, deterministic).
//
// Simulates fills at a provided reference price. It NEVER imports the
// Decision / Signal / Astro engines — the UI passes decision confidence
// and grade in, keeping this module independent of the frozen v1.0 core.

export type PaperFill = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  entryAt: string;
  exitAt: string | null;
  pnl: number;
  status: "OPEN" | "CLOSED";
  decisionConfidence?: number;
  riskGrade?: string;
  notes?: string;
};

export type PaperStats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  profitFactor: number;
};

export function openPaperTrade(input: Omit<PaperFill, "id" | "exitPrice" | "exitAt" | "pnl" | "status">): PaperFill {
  return {
    ...input,
    id: `paper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    exitPrice: null,
    exitAt: null,
    pnl: 0,
    status: "OPEN",
  };
}

export function closePaperTrade(t: PaperFill, exitPrice: number, exitAt = new Date().toISOString()): PaperFill {
  if (t.status === "CLOSED") return t;
  const sign = t.side === "BUY" ? 1 : -1;
  const pnl = Math.round((exitPrice - t.entryPrice) * sign * t.quantity * 100) / 100;
  return { ...t, exitPrice, exitAt, pnl, status: "CLOSED" };
}

export function computePaperStats(trades: PaperFill[]): PaperStats {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const totalPnL = closed.reduce((s, t) => s + t.pnl, 0);

  let peak = 0;
  let cum = 0;
  let maxDD = 0;
  for (const t of closed) {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
    totalPnL: Math.round(totalPnL * 100) / 100,
    bestTrade: closed.length ? Math.max(...closed.map((t) => t.pnl)) : 0,
    worstTrade: closed.length ? Math.min(...closed.map((t) => t.pnl)) : 0,
    avgWin: wins.length ? Math.round((grossProfit / wins.length) * 100) / 100 : 0,
    avgLoss: losses.length ? Math.round((grossLoss / losses.length) * 100) / 100 : 0,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    profitFactor: Number.isFinite(profitFactor) ? Math.round(profitFactor * 100) / 100 : 0,
  };
}