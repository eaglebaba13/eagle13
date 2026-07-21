// Phase 44C — News normalization + sentiment/impact classification.
import type { NewsImpact, NewsItem, NewsItemRaw, NewsSection, NewsSentiment } from "./types";

const POSITIVE = ["surge","rally","beat","record","upgrade","strong","growth","boost","gain","expand","approves","approval","wins","profit","exceeds"];
const NEGATIVE = ["plunge","crash","miss","weak","downgrade","loss","fraud","probe","ban","cut","default","slump","concern","warning","recall","fires"];
const HIGH_IMPACT_KEYS = ["rbi","fomc","fed ","gdp","inflation","cpi","rate hike","rate cut","budget","war","sanction","default","terror","earthquake","tariff"];

export function classifySentiment(headline: string): NewsSentiment {
  const h = headline.toLowerCase();
  const pos = POSITIVE.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0);
  const neg = NEGATIVE.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0);
  if (pos > neg) return "POSITIVE";
  if (neg > pos) return "NEGATIVE";
  return "NEUTRAL";
}

export function classifyImpact(headline: string, category?: string | null): NewsImpact {
  const h = headline.toLowerCase();
  if (HIGH_IMPACT_KEYS.some((k) => h.includes(k))) return "HIGH";
  if (category === "MACRO" || category === "POLICY") return "HIGH";
  if (category === "EARNINGS" || category === "SECTOR") return "MEDIUM";
  return "LOW";
}

export function normalizeNews(items: readonly NewsItemRaw[]): NewsSection {
  const normalized: NewsItem[] = items
    .filter((r) => r.headline && r.headline.trim().length > 0)
    .map((r) => {
      const sentiment = classifySentiment(r.headline);
      const impact = classifyImpact(r.headline, r.category);
      const importance = impact === "HIGH" ? 1 : impact === "MEDIUM" ? 0.6 : 0.3;
      return {
        headline: r.headline.trim(),
        source: r.source || "UNKNOWN",
        publishedAt: r.publishedAt ?? null,
        url: r.url ?? null,
        category: r.category ?? "GENERAL",
        affectedAssets: r.affectedAssets ?? [],
        affectedSector: r.affectedSector ?? null,
        importance,
        sentiment,
        impact,
      };
    })
    .sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      const at = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bt = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bt - at;
    });
  return { items: normalized, highImpact: normalized.filter((n) => n.impact === "HIGH") };
}