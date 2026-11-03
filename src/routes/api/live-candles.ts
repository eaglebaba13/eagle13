import { createFileRoute } from "@tanstack/react-router";
import { createLiveCandleSSE } from "@/lib/live-candle-sse";

// Public research data only; matches the existing public live chart access policy.
export const Route = createFileRoute("/api/live-candles")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        return createLiveCandleSSE(
          url.searchParams.get("symbol") ?? "NIFTY50",
          Number(url.searchParams.get("intervalMs") ?? "60000"),
          request.signal,
        );
      },
    },
  },
});
