// Phase 19 — Broker Integration Framework (types & adapter contract).
//
// Additive integration layer. Broker adapters are pluggable and MUST NOT
// import Decision / Signal / Astro / Backtest / Replay / Options engines.
// Engines remain frozen at v1.0.

export type BrokerId = "zerodha" | "dhan" | "angel" | "upstox" | "paper";

export type ConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
export type ProductType = "MIS" | "NRML" | "CNC";
export type Validity = "DAY" | "IOC";
export type OrderStatus =
  | "PENDING"
  | "OPEN"
  | "COMPLETE"
  | "REJECTED"
  | "CANCELLED"
  | "MODIFIED";

export type BrokerProfile = {
  brokerId: BrokerId;
  brokerName: string;
  clientId: string;
  name: string;
  email?: string;
};

export type Funds = {
  available: number;
  usedMargin: number;
  portfolioValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
};

export type Holding = {
  symbol: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
};

export type Position = {
  symbol: string;
  product: ProductType;
  quantity: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  side: OrderSide;
};

export type OrderRequest = {
  symbol: string;
  side: OrderSide;
  quantity: number;
  lots?: number;
  orderType: OrderType;
  product: ProductType;
  validity: Validity;
  price?: number;
  triggerPrice?: number;
  target?: number;
  stopLoss?: number;
  tag?: string;
};

export type Order = OrderRequest & {
  orderId: string;
  brokerId: BrokerId;
  status: OrderStatus;
  filledQty: number;
  avgFillPrice?: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type MarginPreview = {
  requiredMargin: number;
  brokerage: number;
  taxes: number;
  totalCost: number;
  breakEven: number;
};

export type BrokerHealth = {
  brokerId: BrokerId;
  status: ConnectionStatus;
  latencyMs: number | null;
  apiStatus: "OK" | "DEGRADED" | "DOWN" | "UNKNOWN";
  lastSync: string | null;
};

export interface BrokerAdapter {
  readonly brokerId: BrokerId;
  readonly brokerName: string;
  connect(credentials?: Record<string, string>): Promise<BrokerProfile>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getProfile(): Promise<BrokerProfile>;
  getFunds(): Promise<Funds>;
  getHoldings(): Promise<Holding[]>;
  getPositions(): Promise<Position[]>;
  getOrders(): Promise<Order[]>;
  placeOrder(req: OrderRequest): Promise<Order>;
  modifyOrder(orderId: string, patch: Partial<OrderRequest>): Promise<Order>;
  cancelOrder(orderId: string): Promise<Order>;
  getMargins(req: OrderRequest): Promise<MarginPreview>;
  healthCheck(): Promise<BrokerHealth>;
}