import { describe, it, expect } from "vitest";
import {
  detectSMTDivergence,
  formatSMTTelegramAlert,
  getSMTDivergenceSignals,
  SMT_PAIRS,
  type SMTDivergence,
} from "./smt-divergence.server";
import type { OrderFlowCandle } from "./volume-profile-engine";

describe("Institutional SMT Divergence Engine", () => {
  it("defines institutional correlated pairs (NIFTY/BANKNIFTY, GOLD/SILVER, NIFTY/SENSEX)", () => {
    expect(SMT_PAIRS).toHaveLength(3);
    const pairIds = SMT_PAIRS.map((p) => p.id);
    expect(pairIds).toContain("NIFTY_VS_BANKNIFTY");
    expect(pairIds).toContain("GOLD_VS_SILVER");
    expect(pairIds).toContain("NIFTY_VS_SENSEX");
  });

  it("detects Bullish SMT (Asset 1 makes Lower Low while Asset 2 makes Higher Low)", () => {
    const pair = SMT_PAIRS.find((p) => p.id === "NIFTY_VS_BANKNIFTY")!;
    const baseTime = 1700000000000;

    // Build candle series for Asset 1 (NIFTY): Swing 1 Low = 24,500, Swing 2 Low = 24,450 (Lower Low - LL)
    const candles1: OrderFlowCandle[] = [];
    // Swing 1 Low
    candles1.push({ time: baseTime, open: 24520, high: 24540, low: 24510, close: 24530, volume: 1000 });
    candles1.push({ time: baseTime + 60_000, open: 24530, high: 24535, low: 24500, close: 24510, volume: 1200 }); // Low 1: 24500
    candles1.push({ time: baseTime + 120_000, open: 24510, high: 24560, low: 24510, close: 24550, volume: 1500 });
    // Intermediate rally
    candles1.push({ time: baseTime + 180_000, open: 24550, high: 24580, low: 24545, close: 24575, volume: 1800 });
    // Swing 2 Low (Lower Low)
    candles1.push({ time: baseTime + 240_000, open: 24560, high: 24565, low: 24450, close: 24470, volume: 2200 }); // Low 2: 24450 (LL)
    candles1.push({ time: baseTime + 300_000, open: 24470, high: 24520, low: 24470, close: 24515, volume: 1900 });

    // Build candle series for Asset 2 (BANK NIFTY): Swing 1 Low = 52,000, Swing 2 Low = 52,150 (Higher Low - HL)
    const candles2: OrderFlowCandle[] = [];
    candles2.push({ time: baseTime, open: 52100, high: 52150, low: 52080, close: 52120, volume: 1000 });
    candles2.push({ time: baseTime + 60_000, open: 52120, high: 52140, low: 52000, close: 52050, volume: 1200 }); // Low 1: 52000
    candles2.push({ time: baseTime + 120_000, open: 52050, high: 52200, low: 52040, close: 52180, volume: 1500 });
    // Intermediate rally
    candles2.push({ time: baseTime + 180_000, open: 52180, high: 52350, low: 52170, close: 52320, volume: 1800 });
    // Swing 2 Low (Higher Low)
    candles2.push({ time: baseTime + 240_000, open: 52300, high: 52310, low: 52150, close: 52220, volume: 2200 }); // Low 2: 52150 (HL)
    candles2.push({ time: baseTime + 300_000, open: 52220, high: 52380, low: 52210, close: 52360, volume: 1900 });

    const divergence = detectSMTDivergence(candles1, candles2, pair, "5m");
    expect(divergence).not.toBeNull();
    if (!divergence) return;

    expect(divergence.type).toBe("BULLISH_SMT");
    expect(divergence.institutionalBias).toBe("AGGRESSIVE_BULLISH");
    expect(divergence.asset1.swingType).toBe("LL");
    expect(divergence.asset2.swingType).toBe("HL");
    expect(divergence.confidenceScore).toBeGreaterThanOrEqual(90);
  });

  it("detects Bearish SMT (Asset 1 makes Higher High while Asset 2 makes Lower High)", () => {
    const pair = SMT_PAIRS.find((p) => p.id === "GOLD_VS_SILVER")!;
    const baseTime = 1700000000000;

    // Asset 1 (Gold): High 1 = 2740, High 2 = 2755 (Higher High - HH)
    const candles1: OrderFlowCandle[] = [];
    candles1.push({ time: baseTime, open: 2735, high: 2738, low: 2732, close: 2736, volume: 500 });
    candles1.push({ time: baseTime + 60_000, open: 2736, high: 2740, low: 2735, close: 2738, volume: 600 }); // High 1: 2740
    candles1.push({ time: baseTime + 120_000, open: 2738, high: 2739, low: 2730, close: 2732, volume: 550 });
    candles1.push({ time: baseTime + 180_000, open: 2732, high: 2735, low: 2728, close: 2731, volume: 500 });
    candles1.push({ time: baseTime + 240_000, open: 2731, high: 2755, low: 2730, close: 2750, volume: 1200 }); // High 2: 2755 (HH)
    candles1.push({ time: baseTime + 300_000, open: 2750, high: 2752, low: 2742, close: 2744, volume: 800 });

    // Asset 2 (Silver): High 1 = 33.50, High 2 = 33.20 (Lower High - LH)
    const candles2: OrderFlowCandle[] = [];
    candles2.push({ time: baseTime, open: 33.1, high: 33.3, low: 33.0, close: 33.2, volume: 500 });
    candles2.push({ time: baseTime + 60_000, open: 33.2, high: 33.5, low: 33.1, close: 33.4, volume: 600 }); // High 1: 33.5 (LH ref)
    candles2.push({ time: baseTime + 120_000, open: 33.4, high: 33.4, low: 32.8, close: 32.9, volume: 550 });
    candles2.push({ time: baseTime + 180_000, open: 32.9, high: 33.0, low: 32.7, close: 32.8, volume: 500 });
    candles2.push({ time: baseTime + 240_000, open: 32.8, high: 33.2, low: 32.7, close: 33.0, volume: 900 }); // High 2: 33.2 (LH failure)
    candles2.push({ time: baseTime + 300_000, open: 33.0, high: 33.1, low: 32.4, close: 32.5, volume: 700 });

    const divergence = detectSMTDivergence(candles1, candles2, pair, "15m");
    expect(divergence).not.toBeNull();
    if (!divergence) return;

    expect(divergence.type).toBe("BEARISH_SMT");
    expect(divergence.institutionalBias).toBe("AGGRESSIVE_BEARISH");
    expect(divergence.asset1.swingType).toBe("HH");
    expect(divergence.asset2.swingType).toBe("LH");
    expect(divergence.confidenceScore).toBeGreaterThanOrEqual(90);
  });

  it("formats Telegram alert matching canonical layout", () => {
    const sampleSMT: SMTDivergence = {
      id: "smt-test-1",
      pairId: "NIFTY_VS_BANKNIFTY",
      pairName: "NIFTY 50 vs BANK NIFTY",
      type: "BULLISH_SMT",
      timeframe: "5m",
      asset1: {
        symbol: "NIFTY50",
        name: "NIFTY 50",
        swingAPrice: 24495.0,
        swingBPrice: 24462.5,
        swingType: "LL",
      },
      asset2: {
        symbol: "BANKNIFTY",
        name: "BANK NIFTY",
        swingAPrice: 52120.0,
        swingBPrice: 52280.0,
        swingType: "HL",
      },
      institutionalBias: "AGGRESSIVE_BULLISH",
      targetLiquidity: "PDH Magnet (24,610)",
      confidenceScore: 96,
      detectedAt: new Date().toISOString(),
      timeElapsed: "Just now",
      summary: "NIFTY 50 swept liquidity below previous swing low, while BANK NIFTY defended higher low.",
    };

    const formatted = formatSMTTelegramAlert(sampleSMT);
    expect(formatted).toContain("⚡ [INSTITUTIONAL SMT DIVERGENCE] NIFTY 50 vs BANK NIFTY (5m)");
    expect(formatted).toContain("• Type: Bullish SMT Divergence");
    expect(formatted).toContain("• NIFTY 50: Lower Low swept");
    expect(formatted).toContain("• BANK NIFTY: Higher Low defended");
    expect(formatted).toContain("• Bias: Aggressive Bullish Reversal anticipated");
    expect(formatted).toContain("• Target: PDH Magnet (24,610)");
    expect(formatted).toContain("• Confidence: 96%");
  });

  it("retrieves active SMT signals from curated feed", async () => {
    const signals = await getSMTDivergenceSignals(true);
    expect(signals.length).toBeGreaterThanOrEqual(2);

    const niftyBankNifty = signals.find((s) => s.pairId === "NIFTY_VS_BANKNIFTY");
    expect(niftyBankNifty).toBeDefined();
    expect(niftyBankNifty?.type).toBe("BULLISH_SMT");

    const goldSilver = signals.find((s) => s.pairId === "GOLD_VS_SILVER");
    expect(goldSilver).toBeDefined();
    expect(goldSilver?.type).toBe("BEARISH_SMT");
  });
});
