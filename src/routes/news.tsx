import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  RefreshCw,
  Settings as SettingsIcon,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  WifiOff,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { getMarketNewsFeed, type NewsCategory } from "@/lib/news-feed.functions";
import {
  NewsCard,
  NewsSettings,
  useNewsPrefs,
  useLocalSet,
  filterNews,
  CATEGORIES,
  relTime,
  READ_KEY,
  SAVE_KEY,
} from "@/components/news-shared";
import logoUrl from "@/assets/eaglebaba-logo.png";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "Market News | EagleBABA Live Financial Headlines" },
      {
        name: "description",
        content:
          "Live NIFTY, BankNifty, RBI, SEBI and global market news with AI market view, impact tags and category filters.",
      },
      { property: "og:title", content: "Market News | EagleBABA" },
      { property: "og:description", content: "Live financial news with AI market view and impact tags." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewsPage,
});

const PAGE_SIZE = 6;

function NewsPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<NewsCategory | "All">("All");
  const [page, setPage] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [read, toggleRead] = useLocalSet(READ_KEY);
  const [saved, toggleSaved] = useLocalSet(SAVE_KEY);
  const { prefs, toggleCat, toggleSource, reset } = useNewsPrefs();

  const q = useQuery({
    queryKey: ["market-news-feed"],
    queryFn: () => getMarketNewsFeed(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    // Automatic retry: 5s → 15s → 30s.
    retry: 3,
    retryDelay: (attempt) => [5000, 15000, 30000][attempt] ?? 30000,
  });

  const allItems = q.data?.items ?? [];
  const diag = q.data?.diagnostics;
  const filtered = useMemo(
    () => filterNews(allItems, { query, cat, prefs }),
    [allItems, query, cat, prefs],
  );
  const sources = useMemo(
    () => Array.from(new Set(allItems.map((n) => n.source).filter(Boolean))).sort(),
    [allItems],
  );

  useEffect(() => setPage(1), [query, cat, prefs]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const breaking = allItems.filter((n) => n.breaking);

  return (
    <div style={{ minHeight: "100vh", background: "var(--eb-bg)", color: "var(--eb-text)", position: "relative" }}>
      <div className="eb-space-bg" aria-hidden />
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 16px 48px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logoUrl} alt="EagleBABA" width={40} height={40} style={{ borderRadius: 10 }} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="eb-live-dot" aria-hidden />
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Market News</h1>
              </div>
              <div className="eb-news-sub">
                {q.isFetching ? "Updating…" : q.data ? `Last updated ${relTime(q.data.fetchedAt)}` : "Live financial headlines"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link to="/" className="eb-foot-btn"><ArrowLeft size={14} /> Dashboard</Link>
            <button className="eb-icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings"><SettingsIcon size={16} /></button>
            <button className="eb-icon-btn" onClick={() => q.refetch()} aria-label="Refresh">
              <RefreshCw size={16} className={q.isFetching ? "eb-spin" : undefined} />
            </button>
          </div>
        </div>

        {breaking.length > 0 ? (
          <div className="eb-breaking" style={{ borderRadius: 12, marginBottom: 14 }}>
            <Zap size={14} />
            <span className="eb-breaking-tag">BREAKING</span>
            <span className="eb-breaking-text">{breaking[0].title}</span>
          </div>
        ) : null}

        {import.meta.env.DEV ? (
          <div className="eb-diag" role="status">
            <strong>DEV DIAGNOSTICS</strong>
            <span>API: {q.isError ? "Failed" : q.data ? "Connected" : "…"}</span>
            <span>HTTP: {q.isError ? "error" : q.data ? "200" : "-"}</span>
            <span>Items: {allItems.length}</span>
            <span>Source: {diag?.provider ?? "-"}{diag?.degraded ? " (fallback)" : ""}</span>
            <span>Last fetch: {q.data ? relTime(q.data.fetchedAt) : "-"}</span>
            <span>Refresh: {q.isFetching ? "fetching…" : "every 60s"}</span>
            {diag?.error ? <span>Last error: {diag.error}</span> : null}
          </div>
        ) : null}

        {/* Controls */}
        <div className="eb-news-controls" style={{ padding: 0, marginBottom: 16 }}>
          <div className="eb-news-search">
            <Search size={15} color="var(--eb-muted)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search news, source or keyword…"
              aria-label="Search news"
            />
          </div>
          <div className="eb-news-cats">
            {CATEGORIES.map((c) => (
              <button key={c} className={`eb-cat-chip${cat === c ? " is-active" : ""}`} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        {q.isLoading ? (
          <div className="eb-news-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="eb-news-card">
                <div className="eb-skel" style={{ height: 14, width: "70%" }} />
                <div className="eb-skel" style={{ height: 10, width: "40%" }} />
                <div className="eb-skel" style={{ height: 40, width: "100%" }} />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <div className="eb-news-empty">
            <WifiOff size={30} color="var(--eb-muted)" />
            <p>No latest news available. Please try again later.</p>
            <button className="eb-foot-btn eb-foot-primary" onClick={() => q.refetch()}>
              <RefreshCw size={13} /> Retry Now
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="eb-news-empty">
            <AlertTriangle size={28} color="var(--eb-muted)" />
            <p>
              {allItems.length === 0
                ? `No news returned by provider.${diag ? ` (${diag.count} items)` : ""}`
                : "No matching news for the current filters."}
            </p>
            {allItems.length === 0 && diag?.error && /auth|401|403|key/i.test(diag.error) ? (
              <p style={{ color: "var(--eb-bear)" }}>News API authentication failed.</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="eb-news-grid">
              {pageItems.map((n) => (
                <NewsCard
                  key={n.id}
                  n={n}
                  isRead={read.has(n.id)}
                  isSaved={saved.has(n.id)}
                  onRead={() => toggleRead(n.id)}
                  onSave={() => toggleSaved(n.id)}
                />
              ))}
            </div>

            {/* Pagination */}
            <div className="eb-pagination">
              <button className="eb-icon-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  className={`eb-page-num${page === i + 1 ? " is-active" : ""}`}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button className="eb-icon-btn" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} aria-label="Next page">
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {showSettings ? (
          <NewsSettings
            sources={sources}
            prefs={prefs}
            onToggleCat={toggleCat}
            onToggleSource={toggleSource}
            onReset={reset}
            onClose={() => setShowSettings(false)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
