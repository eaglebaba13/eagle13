import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plug,
  PlugZap,
  Activity,
  ShieldAlert,
  ClipboardList,
  Wallet,
  Send,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  Beaker,
} from "lucide-react";

import { useHydrated } from "@/hooks/use-hydrated";
import { getDecisionSnapshot } from "@/lib/decision.functions";
import {
  createAdapter,
  SUPPORTED_BROKERS,
} from "@/lib/broker/adapters";
import type {
  BrokerAdapter,
  BrokerHealth,
  BrokerId,
  BrokerProfile,
  Funds,
  MarginPreview,
  Order,
  OrderRequest,
  OrderType,
  ProductType,
  Validity,
} from "@/lib/broker/types";
import { readAudit, appendAudit, clearAudit, type AuditEntry } from "@/lib/broker/audit";
import {
  openPaperTrade,
  closePaperTrade,
  computePaperStats,
  type PaperFill,
} from "@/lib/broker/paper-engine";

export const Route = createFileRoute("/broker")({
  component: BrokerPage,
  head: () => ({
    meta: [
      { title: "Broker Integration | EagleBABA" },
      {
        name: "description",
        content:
          "Connect Zerodha, Dhan, Angel One and Upstox to EagleBABA. Order ticket, margin preview, paper trading, audit log and broker health — all built on a pluggable adapter architecture.",
      },
      { property: "og:title", content: "Broker Integration | EagleBABA" },
      {
        property: "og:description",
        content:
          "Institutional trading workstation with multi-broker adapters, safeguards, paper trading and audit log.",
      },
    ],
  }),
});

const PAPER_STORAGE_KEY = "eb_paper_trades_v1";

function loadPaper(): PaperFill[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PAPER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PaperFill[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function savePaper(list: PaperFill[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Translate raw adapter/broker errors into a human-readable sentence while
 * preserving the original message for the diagnostics tooltip.
 */
function humaniseBrokerError(raw: unknown, fallback: string): string {
  const msg = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const lower = msg.toLowerCase();
  if (!msg) return fallback;
  if (lower.includes("not connected")) return "Broker is not connected. Reconnect to continue.";
  if (lower.includes("order not found")) return "That order could not be located. It may have already completed or been cancelled.";
  if (lower.includes("network") || lower.includes("fetch"))
    return "The broker service is unreachable right now. Please retry in a moment.";
  if (lower.includes("timeout")) return "The broker request timed out. Please retry.";
  return msg.length > 160 ? fallback : msg;
}

function connectionTone(status: string | null | undefined, paperMode: boolean): "ok" | "warn" | "bad" | undefined {
  if (paperMode) return "ok";
  if (!status) return undefined;
  const s = status.toUpperCase();
  if (s === "CONNECTED" || s === "OK") return "ok";
  if (s === "DEGRADED" || s === "PARTIAL") return "warn";
  if (s === "DISCONNECTED" || s === "ERROR" || s === "DOWN") return "bad";
  return undefined;
}

function BrokerPage() {
  const hydrated = useHydrated();

  // Singleton adapter cache (per broker id) — kept in a ref so React never re-instantiates.
  const adaptersRef = useRef<Map<BrokerId, BrokerAdapter>>(new Map());
  const getAdapter = (id: BrokerId): BrokerAdapter => {
    let a = adaptersRef.current.get(id);
    if (!a) {
      a = createAdapter(id);
      adaptersRef.current.set(id, a);
    }
    return a;
  };

  const [activeBroker, setActiveBroker] = useState<BrokerId>("zerodha");
  const [paperMode, setPaperMode] = useState(true);
  const [profile, setProfile] = useState<BrokerProfile | null>(null);
  const [funds, setFunds] = useState<Funds | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [health, setHealth] = useState<BrokerHealth | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creds, setCreds] = useState<{ clientId: string; name: string }>({ clientId: "", name: "" });

  // Order ticket state.
  const [ticket, setTicket] = useState<OrderRequest>({
    symbol: "NIFTY",
    side: "BUY",
    quantity: 75,
    lots: 1,
    orderType: "LIMIT",
    product: "MIS",
    validity: "DAY",
    price: 100,
  });
  const [preview, setPreview] = useState<MarginPreview | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperFill[]>([]);
  const [paperExit, setPaperExit] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hydrated) return;
    setAudit(readAudit());
    setPaperTrades(loadPaper());
  }, [hydrated]);

  // Decision snapshot to enrich order preview (never mutates engine).
  const decisionQ = useQuery({
    queryKey: ["decision-snapshot-broker"],
    queryFn: () => getDecisionSnapshot(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const decision = decisionQ.data;
  const dec = decision?.decision;

  const activeAdapter = paperMode ? getAdapter("paper") : getAdapter(activeBroker);

  const refreshHealth = async () => {
    try {
      const h = await activeAdapter.healthCheck();
      setHealth(h);
    } catch {
      /* ignore */
    }
  };

  const refreshAccount = async () => {
    if (!activeAdapter.isConnected()) return;
    try {
      const [f, os] = await Promise.all([activeAdapter.getFunds(), activeAdapter.getOrders()]);
      setFunds(f);
      setOrders(os);
      await refreshHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh account");
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    setProfile(null);
    setFunds(null);
    setOrders([]);
    setHealth(null);
    setError(null);
    if (activeAdapter.isConnected()) {
      activeAdapter.getProfile().then(setProfile).catch(() => {});
      refreshAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBroker, paperMode, hydrated]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const p = await activeAdapter.connect(creds);
      setProfile(p);
      setAudit(appendAudit({ brokerId: p.brokerId, type: "CONNECT", message: `Connected to ${p.brokerName}` }));
      await refreshAccount();
    } catch (e) {
      setError(humaniseBrokerError(e, "We couldn't connect to the broker. Please check your credentials and try again."));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await activeAdapter.disconnect();
      setProfile(null);
      setFunds(null);
      setOrders([]);
      setAudit(appendAudit({ brokerId: activeAdapter.brokerId, type: "DISCONNECT", message: `Disconnected from ${activeAdapter.brokerName}` }));
      await refreshHealth();
    } catch (e) {
      setError(humaniseBrokerError(e, "We couldn't disconnect cleanly. Please refresh and try again."));
    }
  }

  async function handlePreview() {
    setError(null);
    try {
      const p = await activeAdapter.getMargins(ticket);
      setPreview(p);
      setAwaitingConfirm(true);
    } catch (e) {
      setError(humaniseBrokerError(e, "Margin preview is temporarily unavailable."));
    }
  }

  async function handlePlaceOrder() {
    setError(null);
    try {
      if (paperMode) {
        const price = ticket.price ?? ticket.triggerPrice ?? 0;
        if (!price) throw new Error("Set an entry price for paper trades");
        const t = openPaperTrade({
          symbol: ticket.symbol,
          side: ticket.side,
          quantity: ticket.quantity,
          entryPrice: price,
          entryAt: new Date().toISOString(),
          decisionConfidence: dec?.confidence,
          riskGrade: dec?.grade,
        });
        const next = [t, ...paperTrades];
        setPaperTrades(next);
        savePaper(next);
        setAudit(appendAudit({
          brokerId: "paper",
          type: "PAPER_OPEN",
          message: `Paper ${t.side} ${t.quantity} ${t.symbol} @ ${t.entryPrice}`,
          meta: { id: t.id },
        }));
      } else {
        const order = await activeAdapter.placeOrder(ticket);
        setAudit(appendAudit({
          brokerId: order.brokerId,
          type: "ORDER_PLACED",
          message: `${order.side} ${order.quantity} ${order.symbol} (${order.orderType})`,
          meta: { orderId: order.orderId },
        }));
        await refreshAccount();
      }
      setAwaitingConfirm(false);
      setPreview(null);
    } catch (e) {
      setError(humaniseBrokerError(e, "The order could not be submitted. Nothing was placed."));
    }
  }

  async function handleCancel(o: Order) {
    try {
      await activeAdapter.cancelOrder(o.orderId);
      setAudit(appendAudit({
        brokerId: o.brokerId,
        type: "ORDER_CANCELLED",
        message: `Cancelled ${o.side} ${o.symbol}`,
        meta: { orderId: o.orderId },
      }));
      await refreshAccount();
    } catch (e) {
      setError(humaniseBrokerError(e, "The order could not be cancelled. Please retry."));
    }
  }

  function handleClosePaper(t: PaperFill) {
    const raw = paperExit[t.id];
    const exit = Number(raw);
    if (!Number.isFinite(exit) || exit <= 0) {
      setError("Enter a valid exit price");
      return;
    }
    const closed = closePaperTrade(t, exit);
    const next = paperTrades.map((x) => (x.id === t.id ? closed : x));
    setPaperTrades(next);
    savePaper(next);
    setAudit(appendAudit({
      brokerId: "paper",
      type: "PAPER_CLOSE",
      message: `Paper close ${closed.symbol} pnl ${closed.pnl}`,
      meta: { id: closed.id, pnl: closed.pnl },
    }));
  }

  const stats = useMemo(() => computePaperStats(paperTrades), [paperTrades]);
  const openOrders = orders.filter((o) => o.status === "OPEN" || o.status === "MODIFIED" || o.status === "PENDING");

  const connected = activeAdapter.isConnected() || paperMode;
  const connectionLabel = paperMode ? "Paper" : health?.status ?? (activeAdapter.isConnected() ? "CONNECTED" : "DISCONNECTED");
  const connTone = connectionTone(paperMode ? "CONNECTED" : health?.status ?? (activeAdapter.isConnected() ? "CONNECTED" : "DISCONNECTED"), paperMode);

  return (
    <div className="eb-page eb-broker">
      <header className="eb-page-head">
        <div>
          <div className="eb-eyebrow">
            <Plug size={14} /> <span>Phase 19 · Broker Integration Framework</span>
          </div>
          <h1>Broker Workstation</h1>
          <p className="eb-sub">
            Multi-broker adapter layer with order ticket, margin preview, paper trading, audit log and health telemetry.
            The trading engines remain frozen — this page is a pure integration layer.
          </p>
        </div>
        <div className="eb-broker-modeswitch" role="group" aria-label="Trading mode">
          <button
            type="button"
            className={`eb-chip${paperMode ? " is-active" : ""}`}
            aria-pressed={paperMode}
            onClick={() => setPaperMode(true)}
          >
            <Beaker size={14} /> Paper Mode
          </button>
          <button
            type="button"
            className={`eb-chip${!paperMode ? " is-active" : ""}`}
            aria-pressed={!paperMode}
            onClick={() => setPaperMode(false)}
          >
            <PlugZap size={14} /> Live Broker
          </button>
        </div>
      </header>

      <div
        className="eb-mode-banner"
        data-mode={paperMode ? "paper" : "live"}
        role="status"
        aria-live="polite"
      >
        <span className="eb-mode-dot" aria-hidden />
        <strong>{paperMode ? "Paper Mode" : "Live Broker"}</strong>
        <span>
          {paperMode
            ? "Trades are simulated locally in your browser. No real orders are sent."
            : "Live broker adapter is selected. Orders still require an explicit Confirm & Place step."}
        </span>
      </div>

      {!paperMode ? (
        <section className="eb-card">
          <header className="eb-card-head">
            <h2><Plug size={16} /> Broker</h2>
          </header>
          <div className="eb-broker-picker">
            {SUPPORTED_BROKERS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`eb-broker-tile${activeBroker === b.id ? " is-active" : ""}`}
                onClick={() => setActiveBroker(b.id)}
              >
                <div className="eb-broker-tile-name">{b.name}</div>
                <div className="eb-broker-tile-id">{b.id}</div>
              </button>
            ))}
          </div>

          {!activeAdapter.isConnected() ? (
            <div className="eb-broker-connect">
              <div className="eb-field">
                <label>Client ID</label>
                <input
                  value={creds.clientId}
                  onChange={(e) => setCreds({ ...creds, clientId: e.target.value })}
                  placeholder="e.g. AB1234"
                />
              </div>
              <div className="eb-field">
                <label>Display Name</label>
                <input
                  value={creds.name}
                  onChange={(e) => setCreds({ ...creds, name: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <button
                type="button"
                className="eb-btn eb-btn-primary"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? "Connecting…" : "Connect"}
              </button>
              <p className="eb-hint">
                Simulated adapter — production keys and OAuth flows are configured per broker
                and swapped in by implementing the same <code>BrokerAdapter</code> interface.
              </p>
            </div>
          ) : (
            <div className="eb-broker-status">
              <div>
                <div className="eb-kv"><span>Broker</span><strong>{profile?.brokerName}</strong></div>
                <div className="eb-kv"><span>Client</span><strong>{profile?.clientId}</strong></div>
                <div className="eb-kv"><span>Name</span><strong>{profile?.name}</strong></div>
              </div>
              <button type="button" className="eb-btn" onClick={handleDisconnect}>
                <XCircle size={14} /> Disconnect
              </button>
            </div>
          )}
        </section>
      ) : null}

      {/* Account dashboard */}
      <section className="eb-card">
        <header className="eb-card-head">
          <h2><Wallet size={16} /> Account</h2>
          <button type="button" className="eb-btn eb-btn-ghost" onClick={refreshAccount} aria-label="Refresh account snapshot">
            <RefreshCw size={14} /> Refresh
          </button>
        </header>
        <div className="eb-grid eb-grid-4">
          <Stat label="Available Margin" value={funds ? fmt(funds.available) : "—"} />
          <Stat label="Used Margin" value={funds ? fmt(funds.usedMargin) : "—"} />
          <Stat label="Portfolio Value" value={funds ? fmt(funds.portfolioValue) : "—"} />
          <Stat label="Realized / Unrealized" value={funds ? `${fmt(funds.realizedPnL)} / ${fmt(funds.unrealizedPnL)}` : "—"} />
          <Stat label="Open Positions" value="0" />
          <Stat label="Open Orders" value={String(openOrders.length)} />
          <Stat label="Connection" value={connectionLabel} tone={connTone} />
          <Stat
            label="Latency"
            value={health?.latencyMs != null ? `${health.latencyMs} ms` : "—"}
          />
        </div>
      </section>

      {/* Order ticket */}
      <section className="eb-card">
        <header className="eb-card-head">
          <h2><Send size={16} /> Order Ticket</h2>
          <span className="eb-tag" data-mode={paperMode ? "paper" : "live"}>
            {paperMode ? "PAPER" : `LIVE · ${activeAdapter.brokerName}`}
          </span>
        </header>
        {!connected ? (
          <p className="eb-empty">Connect a broker or switch to Paper Mode to place orders.</p>
        ) : (
          <>
            <div className="eb-grid eb-grid-3">
              <Field label="Instrument">
                <input value={ticket.symbol} onChange={(e) => setTicket({ ...ticket, symbol: e.target.value })} />
              </Field>
              <Field label="Side">
                <select value={ticket.side} onChange={(e) => setTicket({ ...ticket, side: e.target.value as "BUY" | "SELL" })}>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  min={1}
                  value={ticket.quantity}
                  onChange={(e) => setTicket({ ...ticket, quantity: Math.max(1, Number(e.target.value) || 0) })}
                />
              </Field>
              <Field label="Order Type">
                <select
                  value={ticket.orderType}
                  onChange={(e) => setTicket({ ...ticket, orderType: e.target.value as OrderType })}
                >
                  <option>MARKET</option><option>LIMIT</option><option>SL</option><option>SL-M</option>
                </select>
              </Field>
              <Field label="Product">
                <select
                  value={ticket.product}
                  onChange={(e) => setTicket({ ...ticket, product: e.target.value as ProductType })}
                >
                  <option>MIS</option><option>NRML</option><option>CNC</option>
                </select>
              </Field>
              <Field label="Validity">
                <select
                  value={ticket.validity}
                  onChange={(e) => setTicket({ ...ticket, validity: e.target.value as Validity })}
                >
                  <option>DAY</option><option>IOC</option>
                </select>
              </Field>
              <Field label="Price">
                <input
                  type="number"
                  value={ticket.price ?? 0}
                  onChange={(e) => setTicket({ ...ticket, price: Number(e.target.value) })}
                />
              </Field>
              <Field label="Stop Loss">
                <input
                  type="number"
                  value={ticket.stopLoss ?? 0}
                  onChange={(e) => setTicket({ ...ticket, stopLoss: Number(e.target.value) })}
                />
              </Field>
              <Field label="Target">
                <input
                  type="number"
                  value={ticket.target ?? 0}
                  onChange={(e) => setTicket({ ...ticket, target: Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="eb-broker-actions">
              <button type="button" className="eb-btn" onClick={handlePreview}>Preview</button>
              {awaitingConfirm ? (
                <button type="button" className="eb-btn eb-btn-primary" onClick={handlePlaceOrder}>
                  <CheckCircle2 size={14} /> Confirm & Place
                </button>
              ) : null}
              {awaitingConfirm ? (
                <button
                  type="button"
                  className="eb-btn eb-btn-ghost"
                  onClick={() => { setAwaitingConfirm(false); setPreview(null); }}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {preview ? (
              <div className="eb-preview">
                <h3><ShieldAlert size={14} /> Order Preview — review before placing</h3>
                <div className="eb-grid eb-grid-4">
                  <Stat label="Required Margin" value={fmt(preview.requiredMargin)} />
                  <Stat label="Brokerage" value={fmt(preview.brokerage)} />
                  <Stat label="Taxes & Fees" value={fmt(preview.taxes)} />
                  <Stat label="Total Cost" value={fmt(preview.totalCost)} />
                  <Stat label="Break-even (₹/unit)" value={fmt(preview.breakEven)} />
                  <Stat label="Decision Confidence" value={dec ? `${Math.round(dec.confidence)}%` : "—"} />
                  <Stat label="Risk Grade" value={dec?.grade ?? "—"} />
                  <Stat label="Regime" value={dec?.regime ?? "—"} />
                </div>
                <p className="eb-hint">
                  Orders are never auto-placed. You must explicitly click <strong>Confirm & Place</strong>.
                </p>
              </div>
            ) : null}
          </>
        )}
        {error ? <p className="eb-err">{error}</p> : null}
      </section>

      {/* Live orders (broker mode) */}
      {!paperMode ? (
        <section className="eb-card">
          <header className="eb-card-head"><h2><Activity size={16} /> Orders</h2></header>
          {orders.length === 0 ? (
            <p className="eb-empty">No orders yet.</p>
          ) : (
            <div className="eb-table-wrap">
              <table className="eb-table">
                <thead><tr>
                  <th>Order ID</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Type</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="mono">{o.orderId.slice(0, 12)}…</td>
                      <td>{o.symbol}</td>
                      <td>{o.side}</td>
                      <td>{o.quantity}</td>
                      <td>{o.orderType}</td>
                      <td>{o.status}</td>
                      <td>
                        {o.status === "OPEN" || o.status === "MODIFIED" ? (
                          <button type="button" className="eb-btn eb-btn-ghost" onClick={() => handleCancel(o)}>
                            Cancel
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Paper trading */}
      {paperMode ? (
        <section className="eb-card">
          <header className="eb-card-head"><h2><Beaker size={16} /> Paper Trades</h2></header>
          <div className="eb-grid eb-grid-4">
            <Stat label="Trades" value={String(stats.trades)} />
            <Stat label="Win Rate" value={`${stats.winRate}%`} />
            <Stat label="Total PnL" value={fmt(stats.totalPnL)} />
            <Stat label="Max Drawdown" value={fmt(stats.maxDrawdown)} />
            <Stat label="Best" value={fmt(stats.bestTrade)} />
            <Stat label="Worst" value={fmt(stats.worstTrade)} />
            <Stat label="Profit Factor" value={String(stats.profitFactor)} />
            <Stat label="Avg Win / Loss" value={`${fmt(stats.avgWin)} / ${fmt(stats.avgLoss)}`} />
          </div>
          {paperTrades.length === 0 ? (
            <p className="eb-empty">No paper trades yet — use the order ticket above.</p>
          ) : (
            <div className="eb-table-wrap">
              <table className="eb-table">
                <thead><tr>
                  <th>Symbol</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {paperTrades.map((t) => (
                    <tr key={t.id}>
                      <td>{t.symbol}</td>
                      <td>{t.side}</td>
                      <td>{t.quantity}</td>
                      <td>{fmt(t.entryPrice)}</td>
                      <td>{t.exitPrice != null ? fmt(t.exitPrice) : "—"}</td>
                      <td className={t.pnl > 0 ? "pos" : t.pnl < 0 ? "neg" : ""}>{fmt(t.pnl)}</td>
                      <td>{t.status}</td>
                      <td>
                        {t.status === "OPEN" ? (
                          <div className="eb-row-inline">
                            <input
                              type="number"
                              placeholder="Exit"
                              value={paperExit[t.id] ?? ""}
                              onChange={(e) => setPaperExit({ ...paperExit, [t.id]: e.target.value })}
                            />
                            <button type="button" className="eb-btn eb-btn-ghost" onClick={() => handleClosePaper(t)}>
                              Close
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {/* Health */}
      <section className="eb-card">
        <header className="eb-card-head"><h2><Activity size={16} /> Broker Health</h2></header>
        <div className="eb-grid eb-grid-4">
          <Stat
            label="Status"
            value={health?.status ?? (paperMode ? "PAPER" : "UNKNOWN")}
            tone={connectionTone(health?.status ?? (paperMode ? "CONNECTED" : "UNKNOWN"), paperMode)}
          />
          <Stat
            label="API"
            value={health?.apiStatus ?? "UNKNOWN"}
            tone={connectionTone(health?.apiStatus, paperMode)}
          />
          <Stat label="Latency" value={health?.latencyMs != null ? `${health.latencyMs} ms` : "—"} />
          <Stat label="Last Sync" value={health?.lastSync ? new Date(health.lastSync).toLocaleTimeString() : "—"} />
        </div>
      </section>

      {/* Audit log */}
      <section className="eb-card">
        <header className="eb-card-head">
          <h2><ClipboardList size={16} /> Audit Log</h2>
          <button
            type="button"
            className="eb-btn eb-btn-ghost"
            onClick={() => { clearAudit(); setAudit([]); }}
          >
            <Trash2 size={14} /> Clear
          </button>
        </header>
        {audit.length === 0 ? (
          <p className="eb-empty">No events logged yet.</p>
        ) : (
          <div className="eb-audit-list">
            {audit.map((e) => (
              <div key={e.id} className="eb-audit-row">
                <span className="eb-audit-ts">{new Date(e.ts).toLocaleString()}</span>
                <span className={`eb-audit-type type-${e.type}`}>{e.type}</span>
                <span className="eb-audit-broker">{e.brokerId}</span>
                <span className="eb-audit-msg">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="eb-stat" data-tone={tone}>
      <div className="eb-stat-label">{label}</div>
      <div className="eb-stat-value">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="eb-field">
      <span>{label}</span>
      {children}
    </label>
  );
}