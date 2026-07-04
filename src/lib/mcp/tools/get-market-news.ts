import { defineTool } from "@lovable.dev/mcp-js";
import { getMarketNews } from "@/lib/news.functions";

export default defineTool({
  name: "get_market_news",
  title: "Get market news",
  description:
    "Latest financial headlines across Indian markets, Bitcoin, gold, and silver, sorted newest first with source and publish time.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async () => {
    const data = await getMarketNews();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data as unknown as Record<string, unknown>,
    };
  },
});