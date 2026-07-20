// Manages a single TradingView WebSocket session and keeps the latest tick.
// Reconnects with exponential backoff. Rejects malformed / negative / wrong-
// symbol updates. Never mutates state outside this module.

import { config } from "./config.mjs";
import { isValidRatio, buildSnapshot } from "./snapshot.mjs";

const state = {
  ratio: null,
  marketTimestamp: null,
  receivedAtMs: null,
  connectionStatus: "IDLE", // IDLE | CONNECTING | CONNECTED | RECONNECTING | STOPPED | ERROR
  errorCount: 0,
  reconnectCount: 0,
  lastError: null,
  lastSuccessfulUpdateAt: null,
  client: null,
  session: null,
  market: null,
  reconnectTimer: null,
  starting: false,
  stopped: false,
};

function setStatus(next) {
  state.connectionStatus = next;
}

function scheduleReconnect() {
  if (state.stopped) return;
  if (state.reconnectTimer) return;
  const attempt = Math.min(state.reconnectCount, 8);
  const delay = Math.min(
    config.reconnectBaseMs * 2 ** attempt,
    config.reconnectMaxMs,
  );
  setStatus("RECONNECTING");
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    state.reconnectCount += 1;
    void start().catch((err) => {
      state.lastError = err instanceof Error ? err.message : String(err);
      state.errorCount += 1;
      scheduleReconnect();
    });
  }, delay);
}

function acceptTick(data) {
  const lp = typeof data?.lp === "number" ? data.lp : null;
  if (!isValidRatio(lp)) return;
  const marketTs = typeof data?.lp_time === "number" ? data.lp_time : null;
  const nowMs = Date.now();
  state.ratio = lp;
  state.marketTimestamp = marketTs;
  state.receivedAtMs = nowMs;
  state.lastSuccessfulUpdateAt = nowMs;
}

async function loadTvModule() {
  // Static ESM import through CJS interop.
  const mod = await import("@mathieuc/tradingview");
  return mod.default ?? mod;
}

export async function start() {
  if (state.starting) return;
  if (state.client) return;
  state.starting = true;
  setStatus("CONNECTING");
  try {
    const TV = await loadTvModule();
    // Prevent duplicate active sessions on races.
    if (state.client) return;
    const client = new TV.Client();
    state.client = client;
    client.onError?.((...args) => {
      state.lastError = args.map(String).join(" ");
      state.errorCount += 1;
    });
    client.onDisconnected?.(() => {
      setStatus("RECONNECTING");
      cleanupSession();
      scheduleReconnect();
    });
    const session = new client.Session.Quote({ fields: "all" });
    state.session = session;
    const market = new session.Market(config.symbol);
    state.market = market;
    market.onData((data) => acceptTick(data));
    market.onError?.((...err) => {
      state.lastError = err.map(String).join(" ");
      state.errorCount += 1;
    });
    setStatus("CONNECTED");
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    state.errorCount += 1;
    setStatus("ERROR");
    cleanupSession();
    scheduleReconnect();
  } finally {
    state.starting = false;
  }
}

function cleanupSession() {
  try {
    state.market?.close?.();
  } catch {
    /* noop */
  }
  try {
    state.session?.delete?.();
  } catch {
    /* noop */
  }
  try {
    state.client?.end?.();
  } catch {
    /* noop */
  }
  state.market = null;
  state.session = null;
  state.client = null;
}

export async function stop() {
  state.stopped = true;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  cleanupSession();
  setStatus("STOPPED");
}

export function getSnapshot(now = Date.now()) {
  return buildSnapshot({
    symbol: config.symbol,
    expectedSymbol: config.symbol,
    ratio: state.ratio,
    marketTimestamp: state.marketTimestamp,
    receivedAtMs: state.receivedAtMs,
    now,
    connectionStatus: state.connectionStatus,
    staleAfterMs: config.staleAfterMs,
    unavailableAfterMs: config.unavailableAfterMs,
    formulaVersion: config.formulaVersion,
  });
}

export function getHealth(now = Date.now()) {
  const ageMs =
    state.receivedAtMs != null ? Math.max(0, now - state.receivedAtMs) : null;
  const connected = state.connectionStatus === "CONNECTED";
  const symbolResolved = isValidRatio(state.ratio);
  const fresh =
    ageMs != null && ageMs <= config.staleAfterMs && symbolResolved;
  const status = connected && fresh
    ? "ok"
    : symbolResolved
      ? "degraded"
      : "unavailable";
  return {
    status,
    connected,
    symbolResolved,
    lastUpdateAt:
      state.lastSuccessfulUpdateAt != null
        ? new Date(state.lastSuccessfulUpdateAt).toISOString()
        : null,
    ageMs,
    errorCount: state.errorCount,
    reconnectCount: state.reconnectCount,
    lastError: state.lastError,
  };
}

// Test-only helpers (not exported from index).
export const __test = {
  reset() {
    state.ratio = null;
    state.marketTimestamp = null;
    state.receivedAtMs = null;
    state.connectionStatus = "IDLE";
    state.errorCount = 0;
    state.reconnectCount = 0;
    state.lastError = null;
    state.lastSuccessfulUpdateAt = null;
    state.stopped = false;
  },
  injectTick(data) {
    acceptTick(data);
  },
  setStatus,
  getState() {
    return { ...state };
  },
};