# TradingView Gold/Silver Ratio Collector (Phase 3F.2C)

Isolated Node 20+ service that subscribes to `TVC:GOLDSILVER` via the
unofficial `@mathieuc/tradingview` client and exposes a canonical snapshot
over HTTP. Runs **outside** the Cloudflare Worker, because the underlying
WebSocket client depends on Node's `ws` module and cannot execute on
workerd.

## Non-goals

- No trading, no order execution.
- No database. State is in memory.
- No user-facing UI. Server-to-server only.
- Not embedded in the EagleBABA main app runtime.

## Endpoints

| Route                      | Auth                     | Description                                |
| -------------------------- | ------------------------ | ------------------------------------------ |
| `GET /health`              | none                     | Liveness/readiness for the host platform.  |
| `GET /v1/gold-silver-ratio`| `Authorization: Bearer …`| Canonical snapshot (see contract below).   |

### Snapshot contract

```json
{
  "symbol": "TVC:GOLDSILVER",
  "ratio": 70.552,
  "signal": "NEUTRAL",
  "source": "TRADINGVIEW_UNOFFICIAL",
  "marketTimestamp": 1784522640,
  "receivedAt": "2026-07-20T04:50:59.438Z",
  "ageMs": 12000,
  "freshness": "LIVE",
  "connectionStatus": "CONNECTED",
  "formulaVersion": "GS_RATIO_50_80_V1"
}
```

Signal rules:

- `ratio < 50` → `BUY_GOLD`
- `50 <= ratio <= 80` → `NEUTRAL`
- `ratio > 80` → `BUY_SILVER`
- ratio unavailable or freshness `UNAVAILABLE` → `signal = "UNAVAILABLE"` and
  `ratio = null`.

## Configuration

See `.env.example`.

## Deployment

Any Docker-compatible Node 20+ host works (Railway, Render, Fly.io, VPS).

```bash
docker build -t eaglebaba-tv-collector .
docker run --rm -p 8787:8787 --env-file .env eaglebaba-tv-collector
```

Point `TRADINGVIEW_COLLECTOR_URL` in the main app at the deployed base URL
(HTTPS in production) and `TRADINGVIEW_COLLECTOR_API_TOKEN` at the same
shared secret. Never expose `COLLECTOR_API_TOKEN` to the browser.

## Operations

- Clean shutdown on `SIGINT` / `SIGTERM`.
- Reconnection uses exponential backoff up to `RECONNECT_MAX_MS`.
- Only one active TradingView session at a time.
- Malformed/negative/stale updates are rejected.
- Logs are bounded (line-scoped, no unbounded payload dumps).