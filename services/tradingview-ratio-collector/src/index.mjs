import http from "node:http";
import { config, assertConfig } from "./config.mjs";
import { start, stop, getSnapshot, getHealth } from "./collector.mjs";

assertConfig();

const buckets = new Map(); // ip → { count, resetAt }
function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > config.rateLimitPerMin;
}

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  if (Buffer.byteLength(payload, "utf8") > config.maxResponseBytes) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"response too large"}');
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const ip = req.socket.remoteAddress ?? "unknown";

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, getHealth());
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/gold-silver-ratio") {
    if (rateLimited(ip)) {
      sendJson(res, 429, { error: "rate_limited" });
      return;
    }
    const auth = req.headers["authorization"] ?? "";
    const provided = typeof auth === "string" && auth.startsWith("Bearer ")
      ? auth.slice("Bearer ".length)
      : "";
    if (!safeCompare(provided, config.apiToken)) {
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }
    sendJson(res, 200, getSnapshot());
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(config.port, config.host, () => {
  // Bounded startup log.
  console.log(
    `[collector] listening on ${config.host}:${config.port} symbol=${config.symbol}`,
  );
  void start().catch((err) => {
    console.error("[collector] initial start failed:", err?.message ?? err);
  });
});

function shutdown(signal) {
  console.log(`[collector] received ${signal} — shutting down`);
  void stop();
  server.close(() => process.exit(0));
  // Fail-safe if close hangs.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));