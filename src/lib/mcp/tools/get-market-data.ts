import { defineTool } from "@lovable.dev/mcp-js";
import { getMarketData } from "@/lib/market.functions";

export default defineTool({
  name: "get_market_data",
  title: "Get market data",
  description:
    "Live quotes for NIFTY 50, BANK NIFTY, India VIX, Bitcoin, gold and silver, including previous-day OHLC, change, and the gold/silver ratio.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const data = await getMarketData();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data as unknown as Record<string, unknown>,
    };
  },
});