import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  X,
  RefreshCw,
  Search,
  Zap,
  WifiOff,
  AlertTriangle,
  Settings as SettingsIcon,
  ArrowLeft,
} from "lucide-react";
import { getMarketNewsFeed } from "@/lib/news-feed.functions";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  NewsCard,
  NewsSettings,
  useNewsPrefs,
  useLocalSet,
  filterNews,
  applyPrefs,
  unreadBreaking,
  CATEGORIES,
  relTime,
  AUTO_KEY,
  READ_KEY,
  SAVE_KEY,
} from "@/components/news-shared";
import type { NewsCategory } from "@/lib/news-feed.functions";

export function NewsCenter() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<NewsCategory | "All">("All");
  const [online, setOnline] = useState(true);
  const [read, toggleRead] = useLocalSet(READ_KEY);
  const [saved, toggleSaved] = useLocalSet(SAVE_KEY);
  const { prefs, toggleCat, toggleSource, reset } = useNewsPrefs();
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Auto-open once per day.
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(AUTO_KEY) !== today) {
        localStorage.setItem(AUTO_KEY, today);
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  // Prevent background scrolling while the popup is open (mobile full-screen sheet).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const q = useQuery({
    queryKey: ["market-news-feed"],
    queryFn: () => getMarketNewsFeed(),
    // Lazy: only fetch after the bell has been opened at least once.
    enabled: hasOpened,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
    // Automatic retry: 5s → 15s → 30s.
    retry: 3,
    retryDelay: (attempt) => [5000, 15000, 30000][attempt] ?? 30000,
  });

  const allItems = q.data?.items ?? [];
  const diag = q.data?.diagnostics;
  const items = useMemo(() => applyPrefs(allItems, prefs), [allItems, prefs]);
  const breakingUnread = useMemo(() => unreadBreaking(items, read), [items, read]);
  const alertCount = breakingUnread.length;

  const filtered = useMemo(
    () => filterNews(allItems, { query, cat, prefs }),
    [allItems, query, cat, prefs],
  );

  const breaking = items.filter((n) => n.breaking);
  const sources = useMemo(
    () => Array.from(new Set(allItems.map((n) => n.source).filter(Boolean))).sort(),
    [allItems],
  );

  const offlineError = q.isError && !online;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`eb-news-bell${alertCount > 0 ? " has-breaking" : ""}`}
        aria-label="Open latest market news"
        title={alertCount > 0 ? `${alertCount} breaking update(s)` : "Latest Market News"}
      >
        <Bell size={18} />
        {alertCount > 0 ? <span className="eb-news-badge">{alertCount > 9 ? "9+" : alertCount}</span> : null}
      </button>

      {mounted
        ? createPortal(
            <>
              <AnimatePresence>
        {open ? (
          <motion.div
            className="eb-news-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className={`eb-news-modal eb-glass${isMobile ? " is-mobile" : ""}`}
              initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.94, y: 12 }}
              animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
              exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.96, y: 8 }}
              transition={
                isMobile
                  ? { type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }
                  : { type: "spring", stiffness: 260, damping: 24 }
              }
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Latest Market News"
            >
              {/* Header */}
              <div className="eb-news-head">
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {isMobile ? (
                    <button
                      className="eb-icon-btn eb-news-back"
                      onClick={() => setOpen(false)}
                      aria-label="Back"
                      title="Back"
                    >
                      <ArrowLeft size={18} />
                    </button>
                  ) : null}
                  <span className="eb-live-dot" aria-hidden />
                  <div style={{ minWidth: 0 }}>
                    <div className="eb-news-title">Latest Market News</div>
                    <div className="eb-news-sub">
                      {!online
                        ? "Offline"
                        : q.isFetching
                          ? "Updating…"
                          : q.data
                            ? `Last updated ${relTime(q.data.fetchedAt)}`
                            : "Live financial headlines"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="eb-icon-btn" onClick={() => setShowSettings(true)} aria-label="News settings" title="Settings">
                    <SettingsIcon size={16} />
                  </button>
                  <button className="eb-icon-btn" onClick={() => q.refetch()} aria-label="Refresh" title="Refresh">
                    <RefreshCw size={16} className={q.isFetching ? "eb-spin" : undefined} />
                  </button>
                  <button className="eb-icon-btn" onClick={() => setOpen(false)} aria-label="Close" title="Close">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Breaking banner */}
              {breaking.length > 0 ? (
                <motion.div className="eb-breaking" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <Zap size={14} />
                  <span className="eb-breaking-tag">BREAKING</span>
                  <span className="eb-breaking-text">{breaking[0].title}</span>
                </motion.div>
              ) : null}

              {/* Controls */}
              <div className="eb-news-controls">
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
                    <button
                      key={c}
                      className={`eb-cat-chip${cat === c ? " is-active" : ""}`}
                      onClick={() => setCat(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body */}
              <div className="eb-news-body">
                {q.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="eb-news-card">
                      <div className="eb-skel" style={{ height: 14, width: "70%" }} />
                      <div className="eb-skel" style={{ height: 10, width: "40%" }} />
                      <div className="eb-skel" style={{ height: 32, width: "100%" }} />
                    </div>
                  ))
                ) : q.isError ? (
                  <div className="eb-news-empty">
                    <WifiOff size={30} color="var(--eb-muted)" />
                    <p>
                      {offlineError
                        ? "No internet connection. No latest news available."
                        : "No latest news available. Please try again later."}
                    </p>
                    <button className="eb-foot-btn eb-foot-primary" onClick={() => q.refetch()}>
                      <RefreshCw size={13} /> Retry Now
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="eb-news-empty">
                    <AlertTriangle size={28} color="var(--eb-muted)" />
                    <p>
                      {allItems.length === 0
                        ? "No news returned by provider."
                        : "No matching news for the current filters."}
                    </p>
                  </div>
                ) : (
                  filtered.map((n) => (
                    <NewsCard
                      key={n.id}
                      n={n}
                      isRead={read.has(n.id)}
                      isSaved={saved.has(n.id)}
                      onRead={() => toggleRead(n.id)}
                      onSave={() => toggleSaved(n.id)}
                    />
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="eb-news-foot">
                <Link className="eb-foot-btn" to="/news" onClick={() => setOpen(false)}>
                  View All News
                </Link>
                <button className="eb-foot-btn" onClick={() => q.refetch()}>Refresh</button>
                <button className="eb-foot-btn eb-foot-primary" onClick={() => setOpen(false)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

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
            </>,
            document.body,
          )
        : null}
    </>
  );
}
