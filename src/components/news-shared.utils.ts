// Non-component news helpers shared by `news-shared.tsx` (NewsCard /
// NewsSettings), `NewsPopup.tsx`, and the `/news` route. Extracted so
// `news-shared.tsx` only exports components (React Fast Refresh).
// Behavior is unchanged.

import { useCallback, useEffect, useState } from "react";
import type { RichNewsItem, NewsImpact, NewsCategory } from "@/lib/news-feed.functions";

export const READ_KEY = "eb-news-read";
export const SAVE_KEY = "eb-news-saved";
export const PREFS_KEY = "eb-news-prefs";
export const AUTO_KEY = "eb-news-auto-open";
export const BREAKING_SEEN_KEY = "eb-news-breaking-seen";

export const IMPACT_COLOR: Record<NewsImpact, string> = {
  Bullish: "var(--eb-bull)",
  Bearish: "var(--eb-bear)",
  "High Volatility": "var(--eb-accent)",
  Important: "var(--eb-blue, #38bdf8)",
  General: "var(--eb-muted)",
};

export const ALL_CATEGORIES: NewsCategory[] = [
  "NIFTY",
  "BANKNIFTY",
  "Equity",
  "Options",
  "FII/DII",
  "Global Markets",
  "Commodities",
  "RBI",
  "SEBI",
  "IPO",
  "Economy",
  "Corporate Results",
];

export const CATEGORIES: (NewsCategory | "All")[] = ["All", ...ALL_CATEGORIES];

export function relTime(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function sourceHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function useLocalSet(key: string): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setSet(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, [key]);
  const toggle = useCallback(
    (id: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key],
  );
  return [set, toggle];
}

/* ---------------------------- Preferences ---------------------------- */

export type NewsPrefs = { disabledCats: string[]; disabledSources: string[] };

export function useNewsPrefs() {
  const [prefs, setPrefs] = useState<NewsPrefs>({ disabledCats: [], disabledSources: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ disabledCats: [], disabledSources: [], ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  const persist = (next: NewsPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const toggleCat = (c: string) =>
    persist({
      ...prefs,
      disabledCats: prefs.disabledCats.includes(c)
        ? prefs.disabledCats.filter((x) => x !== c)
        : [...prefs.disabledCats, c],
    });
  const toggleSource = (s: string) =>
    persist({
      ...prefs,
      disabledSources: prefs.disabledSources.includes(s)
        ? prefs.disabledSources.filter((x) => x !== s)
        : [...prefs.disabledSources, s],
    });
  const reset = () => persist({ disabledCats: [], disabledSources: [] });
  return { prefs, toggleCat, toggleSource, reset };
}

export function applyPrefs(items: RichNewsItem[], prefs: NewsPrefs): RichNewsItem[] {
  return items.filter(
    (n) => !prefs.disabledCats.includes(n.category) && !prefs.disabledSources.includes(n.source),
  );
}

export function filterNews(
  items: RichNewsItem[],
  opts: { query: string; cat: NewsCategory | "All"; prefs: NewsPrefs },
): RichNewsItem[] {
  const term = opts.query.trim().toLowerCase();
  return applyPrefs(items, opts.prefs)
    .filter((n) => (opts.cat === "All" ? true : n.category === opts.cat))
    .filter((n) =>
      term
        ? n.title.toLowerCase().includes(term) ||
          n.source.toLowerCase().includes(term) ||
          n.summary.toLowerCase().includes(term)
        : true,
    )
    .sort((a, b) => {
      if (a.breaking !== b.breaking) return a.breaking ? -1 : 1;
      return +new Date(b.pubDate) - +new Date(a.pubDate);
    });
}

/** Unread breaking items drive the persistent bell alert count. */
export function unreadBreaking(items: RichNewsItem[], read: Set<string>): RichNewsItem[] {
  return items.filter((n) => n.breaking && !read.has(n.id));
}
