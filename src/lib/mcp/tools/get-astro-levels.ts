import { defineTool } from "@lovable.dev/mcp-js";
import { getAstro } from "@/lib/astro.functions";

export default defineTool({
  name: "get_astro_levels",
  title: "Get astro levels",
  description:
    "Astrology-derived NIFTY trading levels for the current session: base/upper/lower cycles, moon sign, nakshatra, planetary rows with levels, and bull/bear/retrograde counts.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async () => {
    const data = await getAstro();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data as unknown as Record<string, unknown>,
    };
  },
});