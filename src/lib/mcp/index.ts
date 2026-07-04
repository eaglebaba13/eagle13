import { defineMcp } from "@lovable.dev/mcp-js";
import getMarketData from "./tools/get-market-data";
import getMarketNews from "./tools/get-market-news";
import getAstroLevels from "./tools/get-astro-levels";

export default defineMcp({
  name: "eaglebaba-mcp",
  title: "EagleBABA Market MCP",
  version: "0.1.0",
  instructions:
    "Tools for EagleBABA. Use `get_market_data` for live NIFTY/BANK NIFTY/VIX/BTC/gold/silver quotes, `get_market_news` for the latest market headlines, and `get_astro_levels` for astrology-derived NIFTY trading levels.",
  tools: [getMarketData, getMarketNews, getAstroLevels],
});