import { describe, it, expect } from "vitest";
import { ZerodhaAdapter, DhanAdapter, AngelAdapter, UpstoxAdapter, createAdapter } from "./adapters";
import { openPaperTrade, closePaperTrade, computePaperStats } from "./paper-engine";
import type { OrderRequest } from "./types";

const sampleOrder: OrderRequest = {
  symbol: "NIFTY25000CE",
  side: "BUY",
  quantity: 75,
  orderType: "LIMIT",
  product: "MIS",
  validity: "DAY",
  price: 120,
};

describe("broker adapters", () => {
  it("connect/disconnect updates status", async () => {
    const a = new ZerodhaAdapter();
    expect(a.isConnected()).toBe(false);
    await a.connect({ clientId: "AB1234" });
    expect(a.isConnected()).toBe(true);
    const p = await a.getProfile();
    expect(p.clientId).toBe("AB1234");
    await a.disconnect();
    expect(a.isConnected()).toBe(false);
  });

  it("placeOrder returns OPEN order with id", async () => {
    const a = new DhanAdapter();
    await a.connect();
    const o = await a.placeOrder(sampleOrder);
    expect(o.status).toBe("OPEN");
    expect(o.orderId).toBeTruthy();
    expect((await a.getOrders()).length).toBe(1);
  });

  it("cancelOrder marks order CANCELLED", async () => {
    const a = new AngelAdapter();
    await a.connect();
    const o = await a.placeOrder(sampleOrder);
    const cancelled = await a.cancelOrder(o.orderId);
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("getMargins previews cost", async () => {
    const a = new UpstoxAdapter();
    await a.connect();
    const m = await a.getMargins(sampleOrder);
    expect(m.requiredMargin).toBeGreaterThan(0);
    expect(m.brokerage).toBeGreaterThanOrEqual(0);
    expect(m.totalCost).toBeGreaterThanOrEqual(0);
  });

  it("factory produces every supported broker", () => {
    for (const id of ["zerodha", "dhan", "angel", "upstox", "paper"] as const) {
      const a = createAdapter(id);
      expect(a.brokerId).toBe(id);
    }
  });

  it("guards calls when disconnected", async () => {
    const a = new ZerodhaAdapter();
    await expect(a.getFunds()).rejects.toThrow();
  });
});

describe("paper engine", () => {
  it("opens/closes and computes pnl for BUY", () => {
    const t = openPaperTrade({
      symbol: "NIFTY", side: "BUY", quantity: 75, entryPrice: 100, entryAt: new Date().toISOString(),
    });
    const closed = closePaperTrade(t, 110);
    expect(closed.pnl).toBe(750);
    expect(closed.status).toBe("CLOSED");
  });

  it("computes pnl for SELL", () => {
    const t = openPaperTrade({
      symbol: "NIFTY", side: "SELL", quantity: 30, entryPrice: 200, entryAt: new Date().toISOString(),
    });
    const closed = closePaperTrade(t, 180);
    expect(closed.pnl).toBe(600);
  });

  it("stats winRate + drawdown", () => {
    const base = { symbol: "X", entryAt: new Date().toISOString() };
    const t1 = closePaperTrade(openPaperTrade({ ...base, side: "BUY", quantity: 1, entryPrice: 100 }), 110);
    const t2 = closePaperTrade(openPaperTrade({ ...base, side: "BUY", quantity: 1, entryPrice: 100 }), 90);
    const t3 = closePaperTrade(openPaperTrade({ ...base, side: "BUY", quantity: 1, entryPrice: 100 }), 105);
    const s = computePaperStats([t1, t2, t3]);
    expect(s.trades).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.totalPnL).toBe(5);
    expect(s.winRate).toBeCloseTo(66.7, 1);
    expect(s.maxDrawdown).toBe(10);
  });
});