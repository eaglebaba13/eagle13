// Phase 19 — Broker adapters (simulated integration layer).
//
// Real broker APIs require OAuth login flows and API keys that must be
// configured per user. This module provides a clean adapter contract and
// safe simulated implementations so the UI, order flow, safeguards, audit
// log and paper-trading engine can be built and tested without touching
// live capital or the frozen trading engines.
//
// Swapping a simulated adapter for a real one requires only implementing
// the BrokerAdapter interface; NO trading-engine code changes.

import type {
  BrokerAdapter,
  BrokerHealth,
  BrokerId,
  BrokerProfile,
  ConnectionStatus,
  Funds,
  Holding,
  MarginPreview,
  Order,
  OrderRequest,
  Position,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function estimateBrokerage(brokerId: BrokerId, req: OrderRequest): number {
  // Per-order brokerage estimate (₹). Realistic institutional discount-broker
  // fees for intraday equity/F&O; used only for previews.
  const base: Record<BrokerId, number> = {
    zerodha: 20,
    dhan: 20,
    angel: 20,
    upstox: 20,
    paper: 0,
  };
  const perOrder = base[brokerId] ?? 20;
  const isIntraday = req.product === "MIS";
  return isIntraday ? perOrder : Math.min(perOrder, Math.max(1, req.quantity * 0.01));
}

function estimateTaxes(req: OrderRequest, notional: number): number {
  // Very rough combined taxes/fees; for preview only.
  const stt = req.side === "SELL" ? notional * 0.000625 : 0;
  const gst = notional * 0.00018;
  const exch = notional * 0.00005;
  return Math.round((stt + gst + exch) * 100) / 100;
}

function marginFor(req: OrderRequest, refPrice: number): number {
  const notional = req.quantity * refPrice;
  const factor = req.product === "MIS" ? 0.2 : 1;
  return Math.round(notional * factor);
}

class BaseSimulatedAdapter implements BrokerAdapter {
  readonly brokerId: BrokerId;
  readonly brokerName: string;
  private status: ConnectionStatus = "DISCONNECTED";
  private profile: BrokerProfile | null = null;
  private orders: Order[] = [];
  private funds: Funds = {
    available: 100_000,
    usedMargin: 0,
    portfolioValue: 100_000,
    realizedPnL: 0,
    unrealizedPnL: 0,
  };
  private lastSync: string | null = null;

  constructor(id: BrokerId, name: string) {
    this.brokerId = id;
    this.brokerName = name;
  }

  async connect(credentials?: Record<string, string>): Promise<BrokerProfile> {
    this.status = "CONNECTING";
    await new Promise((r) => setTimeout(r, 250));
    const clientId = credentials?.clientId?.trim() || `SIM${Math.floor(Math.random() * 90000 + 10000)}`;
    this.profile = {
      brokerId: this.brokerId,
      brokerName: this.brokerName,
      clientId,
      name: credentials?.name?.trim() || "Simulated User",
      email: credentials?.email?.trim(),
    };
    this.status = "CONNECTED";
    this.lastSync = nowIso();
    return this.profile;
  }

  async disconnect() {
    this.status = "DISCONNECTED";
    this.profile = null;
  }

  isConnected() {
    return this.status === "CONNECTED";
  }

  private assertConnected() {
    if (!this.isConnected() || !this.profile) throw new Error(`${this.brokerName} is not connected`);
  }

  async getProfile() {
    this.assertConnected();
    return this.profile!;
  }

  async getFunds() {
    this.assertConnected();
    this.lastSync = nowIso();
    return { ...this.funds };
  }

  async getHoldings(): Promise<Holding[]> {
    this.assertConnected();
    return [];
  }

  async getPositions(): Promise<Position[]> {
    this.assertConnected();
    return [];
  }

  async getOrders(): Promise<Order[]> {
    this.assertConnected();
    return [...this.orders];
  }

  async placeOrder(req: OrderRequest): Promise<Order> {
    this.assertConnected();
    const order: Order = {
      ...req,
      orderId: uid("ord"),
      brokerId: this.brokerId,
      status: "OPEN",
      filledQty: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.orders.unshift(order);
    this.lastSync = nowIso();
    return order;
  }

  async modifyOrder(orderId: string, patch: Partial<OrderRequest>): Promise<Order> {
    this.assertConnected();
    const idx = this.orders.findIndex((o) => o.orderId === orderId);
    if (idx < 0) throw new Error("Order not found");
    const updated: Order = { ...this.orders[idx], ...patch, status: "MODIFIED", updatedAt: nowIso() };
    this.orders[idx] = updated;
    return updated;
  }

  async cancelOrder(orderId: string): Promise<Order> {
    this.assertConnected();
    const idx = this.orders.findIndex((o) => o.orderId === orderId);
    if (idx < 0) throw new Error("Order not found");
    const updated: Order = { ...this.orders[idx], status: "CANCELLED", updatedAt: nowIso() };
    this.orders[idx] = updated;
    return updated;
  }

  async getMargins(req: OrderRequest): Promise<MarginPreview> {
    const refPrice = req.price ?? req.triggerPrice ?? 100;
    const notional = req.quantity * refPrice;
    const requiredMargin = marginFor(req, refPrice);
    const brokerage = estimateBrokerage(this.brokerId, req);
    const taxes = estimateTaxes(req, notional);
    const totalCost = brokerage + taxes;
    const breakEven = req.quantity > 0 ? totalCost / req.quantity : 0;
    return { requiredMargin, brokerage, taxes, totalCost, breakEven: Math.round(breakEven * 100) / 100 };
  }

  async healthCheck(): Promise<BrokerHealth> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 40));
    return {
      brokerId: this.brokerId,
      status: this.status,
      latencyMs: Date.now() - start,
      apiStatus: this.status === "CONNECTED" ? "OK" : "UNKNOWN",
      lastSync: this.lastSync,
    };
  }
}

export class ZerodhaAdapter extends BaseSimulatedAdapter {
  constructor() {
    super("zerodha", "Zerodha Kite");
  }
}
export class DhanAdapter extends BaseSimulatedAdapter {
  constructor() {
    super("dhan", "Dhan");
  }
}
export class AngelAdapter extends BaseSimulatedAdapter {
  constructor() {
    super("angel", "Angel One");
  }
}
export class UpstoxAdapter extends BaseSimulatedAdapter {
  constructor() {
    super("upstox", "Upstox");
  }
}

export function createAdapter(id: BrokerId): BrokerAdapter {
  switch (id) {
    case "zerodha":
      return new ZerodhaAdapter();
    case "dhan":
      return new DhanAdapter();
    case "angel":
      return new AngelAdapter();
    case "upstox":
      return new UpstoxAdapter();
    case "paper":
      return new BaseSimulatedAdapter("paper", "Paper Trading");
  }
}

export const SUPPORTED_BROKERS: { id: BrokerId; name: string }[] = [
  { id: "zerodha", name: "Zerodha Kite" },
  { id: "dhan", name: "Dhan" },
  { id: "angel", name: "Angel One" },
  { id: "upstox", name: "Upstox" },
];