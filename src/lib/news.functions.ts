import { createServerFn } from "@tanstack/react-start";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  pubDate: string; // ISO
  category: "MARKET" | "BTC" | "GOLD" | "SILVER";
};

const FEEDS: { category: NewsItem["category"]; query: string }[] = [
  { category: "MARKET", query: "nifty sensex indian stock market" },
  { category: "BTC", query: "bitcoin crypto price" },
  { category: "GOLD", query: "gold price XAU" },
  { category: "SILVER", query: "silver price XAG" },
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
    .replace(/<[^>]+>/g, "")
    .trim();
}

function pick(tag: string, block: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

async function fetchFeed(
  category: NewsItem["category"],
  query: string,
): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query + " when:2d",
  )}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = xml.split("<item>").slice(1);
  return items.slice(0, 8).map((raw) => {
    const block = raw.split("</item>")[0];
    const rawTitle = pick("title", block);
    const parts = rawTitle.split(" - ");
    const source = pick("source", block) || (parts.length > 1 ? parts.pop()! : "");
    const title = parts.length > 1 ? parts.join(" - ") : rawTitle;
    const pd = pick("pubDate", block);
    const iso = pd ? new Date(pd).toISOString() : new Date().toISOString();
    return {
      title: title || rawTitle,
      link: pick("link", block),
      source,
      pubDate: iso,
      category,
    };
  });
}

export const getMarketNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: NewsItem[]; fetchedAt: string }> => {
    const results = await Promise.all(
      FEEDS.map((f) => fetchFeed(f.category, f.query).catch(() => [])),
    );
    const seen = new Set<string>();
    const items = results
      .flat()
      .filter((it) => {
        if (!it.title || seen.has(it.title)) return false;
        seen.add(it.title);
        return true;
      })
      .sort((a, b) => +new Date(b.pubDate) - +new Date(a.pubDate))
      .slice(0, 30);
    return { items, fetchedAt: new Date().toISOString() };
  },
);
