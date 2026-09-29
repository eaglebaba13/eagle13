// Live-candle SSE route registered through the existing TanStack Start server API.
import { createFileRoute } from "@tanstack/react-router";
import { createLiveCandleSSE } from "@/lib/live-candle-sse";

export const Route = createFileRoute("/api/live-candles")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = url.searchParams.get("symbol") ?? "NIFTY50";
        const intervalMs = Number(url.searchParams.get("intervalMs") ?? "60000");
        return createLiveCandleSSE(symbol, intervalMs);
      },
    },
  },
});
