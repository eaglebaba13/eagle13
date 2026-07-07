import { createServerFn } from "@tanstack/react-start";
import { fetchTextSafe } from "./http";

export type NewsImpact =
  | "Bullish"
  | "Bearish"
  | "High Volatility"
  | "Important"
  | "General";

export type NewsCategory =
  | "Equity"
  | "NIFTY"
  | "BANKNIFTY"
  | "Options"
  | "FII/DII"
  | "Global Markets"
  | "Commodities"
  | "RBI"
  | "SEBI"
  | "IPO"
  | "Economy"
  | "Corporate Results";

export type RichNewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  category: NewsCategory;
  summary: string;
  aiView: string;
  impact: NewsImpact;
  breaking: boolean;
};

const FEEDS: { category: NewsCategory; query: string }[] = [
  { category: "NIFTY", query: "nifty 50 index today" },
  { category: "BANKNIFTY", query: "bank nifty banknifty" },
  { category: "Equity", query: "indian stock market sensex equity" },
  { category: "Options", query: "nifty options open interest" },
  { category: "FII/DII", query: "FII DII flows india" },
  { category: "Global Markets", query: "global markets dow nasdaq" },
  { category: "Commodities", query: "gold silver crude oil india price" },
  { category: "RBI", query: "RBI reserve bank of india policy" },
  { category: "SEBI", query: "SEBI regulation markets india" },
  { category: "IPO", query: "IPO india listing gmp" },
  { category: "Economy", query: "india economy gdp inflation" },
  { category: "Corporate Results", query: "india company quarterly results earnings" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

const BULL = /\b(surge|surges|rally|rallies|gain|gains|jump|jumps|rise|rises|soar|soars|record high|all-time high|profit|profits|beat|beats|upgrade|upgrades|bullish|boost|outperform|hits high|rebound|recover|inflow|inflows)\b/i;
const BEAR = /\b(fall|falls|drop|drops|crash|crashes|plunge|plunges|slump|slumps|loss|losses|decline|declines|miss|misses|downgrade|downgrades|bearish|tumble|slide|slides|sell-off|selloff|weak|cut|cuts|outflow|outflows|sink|sinks)\b/i;
const VOL = /\b(volatile|volatility|swing|swings|whipsaw|uncertain|spike|choppy|turbulent|roller|jitters)\b/i;

function classify(title: string, category: NewsCategory): NewsImpact {
  const t = title.toLowerCase();
  if (VOL.test(t)) return "High Volatility";
  const bull = BULL.test(t);
  const bear = BEAR.test(t);
  if (bull && !bear) return "Bullish";
  if (bear && !bull) return "Bearish";
  if (category === "RBI" || category === "SEBI" || /policy|rate|regulat|ban|fraud|probe/i.test(t))
    return "Important";
  return "General";
}

function aiViewOf(impact: NewsImpact, category: NewsCategory): string {
  switch (impact) {
    case "Bullish":
      if (category === "BANKNIFTY") return "Likely positive for banking & financial stocks.";
      if (category === "Commodities") return "Supportive for commodity & metal counters.";
      if (category === "FII/DII") return "Positive flow signal — supportive for indices.";
      return "Likely positive momentum for broader markets.";
    case "Bearish":
      if (category === "BANKNIFTY") return "Likely pressure on banking & NBFC stocks.";
      if (category === "Global Markets") return "Global weakness may weigh on Indian equities.";
      return "Likely negative bias — watch for downside risk.";
    case "High Volatility":
      return "Expect elevated volatility and wide intraday swings.";
    case "Important":
      return "Policy / regulatory event — potential market-moving impact.";
    default:
      return "Neutral impact — informational for market context.";
  }
}

const CATEGORY_BLURB: Record<NewsCategory, string> = {
  NIFTY: "Movement and levels in the NIFTY 50 benchmark index.",
  BANKNIFTY: "Banking index and financial sector activity.",
  Equity: "Broad equity market trend and stock-specific action.",
  Options: "Derivatives, open interest and options positioning.",
  "FII/DII": "Institutional fund flows shaping market direction.",
  "Global Markets": "Overseas cues influencing domestic sentiment.",
  Commodities: "Gold, silver and energy commodity price trends.",
  RBI: "Central bank policy and monetary signals.",
  SEBI: "Market regulation and compliance updates.",
  IPO: "Primary market listings and subscription activity.",
  Economy: "Macro data and key economic indicators.",
  "Corporate Results": "Company earnings and quarterly performance.",
};

function summaryOf(item: { source: string; category: NewsCategory }): string {
  return `${CATEGORY_BLURB[item.category]} Source: ${item.source || "Markets"}.`;
}

async function fetchFeed(category: NewsCategory, query: string): Promise<RichNewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query + " when:2d",
  )}&hl=en-IN&gl=IN&ceid=IN:en`;
  const xml = await fetchTextSafe(url, {
    accept: "application/rss+xml, application/xml, text/xml",
  });
  if (!xml) return [];
  const items = xml.split("<item>").slice(1);
  return items.slice(0, 4).map((raw, idx) => {
    const block = raw.split("</item>")[0];
    const rawTitle = pick("title", block);
    const parts = rawTitle.split(" - ");
    const source = pick("source", block) || (parts.length > 1 ? parts.pop()! : "");
    const title = (parts.length > 1 ? parts.join(" - ") : rawTitle) || rawTitle;
    const pd = pick("pubDate", block);
    let iso = new Date().toISOString();
    if (pd) {
      const d = new Date(pd);
      if (!Number.isNaN(d.getTime())) iso = d.toISOString();
    }
    const impact = classify(title, category);
    const breaking = /\bbreaking\b|\bjust in\b|\blive updates?\b/i.test(rawTitle);
    const link = `https://www.google.com/search?q=${encodeURIComponent(
      source ? `${title} ${source}` : title,
    )}`;
    return {
      id: `${category}-${idx}-${iso}`,
      title,
      link,
      source,
      pubDate: iso,
      category,
      summary: summaryOf({ source, category }),
      aiView: aiViewOf(impact, category),
      impact,
      breaking,
    };
  });
}

// 5-minute in-memory cache to satisfy the "cache responses for 5 minutes" spec.
let cache: { at: number; payload: { items: RichNewsItem[]; fetchedAt: string } } | null = null;
const TTL = 5 * 60 * 1000;

export const getMarketNewsFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: RichNewsItem[]; fetchedAt: string }> => {
    if (cache && Date.now() - cache.at < TTL) return cache.payload;

    const results = await Promise.all(
      FEEDS.map((f) => fetchFeed(f.category, f.query).catch(() => [] as RichNewsItem[])),
    );
    const seen = new Set<string>();
    const items = results
      .flat()
      .filter((it) => {
        const key = it.title.toLowerCase();
        if (!it.title || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
        return +new Date(b.pubDate) - +new Date(a.pubDate);
      })
      .slice(0, 12);

    const payload = { items, fetchedAt: new Date().toISOString() };
    cache = { at: Date.now(), payload };
    return payload;
  },
);
