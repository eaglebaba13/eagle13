import { createServerFn } from "@tanstack/react-start";
import { fetchTextSafe } from "./http";
import { fetchFallback, FALLBACK_MARKET_FEEDS, FALLBACK_CRYPTO_FEEDS, type RawRssItem } from "./rss";

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

export type AiStance = "Bull" | "Bear" | "Neutral" | "Volatile";

export type AiView = {
  stance: AiStance;
  level: string; // key level / technical hint
  sector: string; // likely sector impact
  text: string; // concise one-line synthesis
};

export type RichNewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  category: NewsCategory;
  summary: string;
  ai: AiView;
  impact: NewsImpact;
  breaking: boolean;
};

export type FeedDiagnostics = {
  provider: string;
  count: number;
  degraded: boolean;
  error: string | null;
};

export type FeedResult = {
  items: RichNewsItem[];
  fetchedAt: string;
  diagnostics: FeedDiagnostics;
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

const SECTOR_BY_CATEGORY: Record<NewsCategory, string> = {
  NIFTY: "Broad market (large-caps)",
  BANKNIFTY: "Banks & financials",
  Equity: "Broad equities",
  Options: "Index derivatives",
  "FII/DII": "Large-cap indices",
  "Global Markets": "IT & export-oriented names",
  Commodities: "Metals & energy",
  RBI: "Rate-sensitives (banks, autos, realty)",
  SEBI: "Brokers & market infrastructure",
  IPO: "New listings & primary market",
  Economy: "Cyclicals & consumption",
  "Corporate Results": "Result-season movers",
};

function stanceOf(impact: NewsImpact): AiStance {
  if (impact === "Bullish") return "Bull";
  if (impact === "Bearish") return "Bear";
  if (impact === "High Volatility") return "Volatile";
  return "Neutral";
}

function levelHint(stance: AiStance): string {
  switch (stance) {
    case "Bull":
      return "Holding above near-term support; watch for a break past resistance to extend upside.";
    case "Bear":
      return "Below key support; failure to reclaim it opens further downside.";
    case "Volatile":
      return "Expect wide swings around pivot levels — trade the range, avoid chasing.";
    default:
      return "Rangebound between support and resistance; await a decisive breakout.";
  }
}

function aiViewOf(impact: NewsImpact, category: NewsCategory): AiView {
  const stance = stanceOf(impact);
  const sector = SECTOR_BY_CATEGORY[category];
  const level = levelHint(stance);
  const lead =
    stance === "Bull"
      ? `Bullish for ${sector.toLowerCase()}`
      : stance === "Bear"
        ? `Bearish for ${sector.toLowerCase()}`
        : stance === "Volatile"
          ? `High volatility likely for ${sector.toLowerCase()}`
          : `Neutral impact on ${sector.toLowerCase()}`;
  return { stance, level, sector, text: `${lead}.` };
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
    retries: 3,
    retryDelayMs: 400,
    exponential: true,
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
      ai: aiViewOf(impact, category),
      impact,
      breaking,
    };
  });
}

// 5-minute in-memory cache to satisfy the "cache responses for 5 minutes" spec.
let cache: { at: number; payload: FeedResult } | null = null;
const TTL = 5 * 60 * 1000;

function inferCategory(title: string): NewsCategory {
  const t = title.toLowerCase();
  if (/\bbank nifty|banknifty\b/.test(t)) return "BANKNIFTY";
  if (/\bnifty\b/.test(t)) return "NIFTY";
  if (/\boption|call|put|open interest|\boi\b/.test(t)) return "Options";
  if (/\bfii|dii|foreign investor|institutional\b/.test(t)) return "FII/DII";
  if (/\brbi|repo|monetary policy\b/.test(t)) return "RBI";
  if (/\bsebi\b/.test(t)) return "SEBI";
  if (/\bipo|listing|gmp\b/.test(t)) return "IPO";
  if (/\bgold|silver|crude|oil|commodity|commodities|bitcoin|btc|crypto\b/.test(t)) return "Commodities";
  if (/\bdow|nasdaq|s&p|global|us market|asian market\b/.test(t)) return "Global Markets";
  if (/\bgdp|inflation|economy|cpi|wpi\b/.test(t)) return "Economy";
  if (/\bresult|earnings|profit|revenue|q1|q2|q3|q4\b/.test(t)) return "Corporate Results";
  return "Equity";
}

function toRichItems(raw: RawRssItem[]): RichNewsItem[] {
  return raw.map((r, idx) => {
    const category = inferCategory(r.title);
    const impact = classify(r.title, category);
    const breaking = /\bbreaking\b|\bjust in\b|\blive updates?\b/i.test(r.title);
    return {
      id: `fb-${category}-${idx}-${r.pubDate}`,
      title: r.title,
      link: r.link || `https://www.google.com/search?q=${encodeURIComponent(r.title)}`,
      source: r.source,
      pubDate: r.pubDate,
      category,
      summary: summaryOf({ source: r.source, category }),
      ai: aiViewOf(impact, category),
      impact,
      breaking,
    };
  });
}

function dedupeSort(items: RichNewsItem[], limit: number): RichNewsItem[] {
  const seen = new Set<string>();
  return items
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
    .slice(0, limit);
}

export const getMarketNewsFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<FeedResult> => {
    if (cache && Date.now() - cache.at < TTL) return cache.payload;

    const fetchedAt = new Date().toISOString();
    let primaryError: string | null = null;
    let payload: FeedResult;

    // 1) Primary provider: Google News RSS.
    try {
      const results = await Promise.all(
        FEEDS.map((f) => fetchFeed(f.category, f.query).catch(() => [] as RichNewsItem[])),
      );
      const items = dedupeSort(results.flat(), 12);
      if (items.length > 0) {
        payload = {
          items,
          fetchedAt,
          diagnostics: { provider: "Google News", count: items.length, degraded: false, error: null },
        };
        cache = { at: Date.now(), payload };
        return payload;
      }
      primaryError = "Primary provider returned no items";
    } catch (err) {
      primaryError = err instanceof Error ? err.message : String(err);
    }

    // 2) Fallback providers (reachable from the Cloudflare Worker in production).
    try {
      const [market, crypto] = await Promise.all([
        fetchFallback(FALLBACK_MARKET_FEEDS),
        fetchFallback(FALLBACK_CRYPTO_FEEDS),
      ]);
      const items = dedupeSort(toRichItems([...market, ...crypto]), 12);
      payload = {
        items,
        fetchedAt,
        diagnostics: {
          provider: items.length ? "Fallback (ET/Livemint/BusinessLine/CoinDesk)" : "None",
          count: items.length,
          degraded: true,
          error: items.length ? primaryError : "No news returned by provider.",
        },
      };
    } catch (err) {
      payload = {
        items: [],
        fetchedAt,
        diagnostics: {
          provider: "None",
          count: 0,
          degraded: true,
          error: err instanceof Error ? err.message : "No news returned by provider.",
        },
      };
    }

    // Only cache non-empty payloads so a transient empty result isn't pinned for 5 min.
    if (payload.items.length > 0) cache = { at: Date.now(), payload };
    return payload;
  },
);
