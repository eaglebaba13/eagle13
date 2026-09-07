// API route for live candle SSE streaming.
// TanStack Start + Nitro compatible.
// Returns a streaming Response with text/event-stream.

import { createLiveCandleSSE } from "@/lib/live-candle-sse";

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? "NIFTY50";
  const intervalMs = Number(url.searchParams.get("intervalMs") ?? "60000");

  return createLiveCandleSSE(symbol, intervalMs);
}
