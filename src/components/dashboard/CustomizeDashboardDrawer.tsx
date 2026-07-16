import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  hideWidget,
  showWidget,
  toggleCollapsed,
  moveWidget,
  resetDesktop,
  resetMobile,
  resetAll,
  isHidden,
  isCollapsed,
  REQUIRED_WIDGET_IDS,
  type DashboardPreferences,
} from "@/lib/dashboard-preferences";
import type { WidgetDefinition } from "@/lib/dashboard-widgets";

// Phase 24E · Accessible customization drawer.
//
// Reads from + writes to a passed-in DashboardPreferences state via `onChange`.
// No provider fetch. No re-render side-effects outside preferences.

type Props = {
  open: boolean;
  onClose: () => void;
  prefs: DashboardPreferences;
  onChange: (p: DashboardPreferences) => void;
  widgets: readonly WidgetDefinition[];
  device: "desktop" | "mobile";
};

export function CustomizeDashboardDrawer({
  open,
  onClose,
  prefs,
  onChange,
  widgets,
  device,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // focus first focusable
    panelRef.current?.querySelector<HTMLElement>("button, [tabindex]")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const bySection = useMemo(() => {
    const groups = new Map<string, WidgetDefinition[]>();
    for (const w of widgets) {
      const arr = groups.get(w.section) ?? [];
      arr.push(w);
      groups.set(w.section, arr);
    }
    return Array.from(groups.entries());
  }, [widgets]);

  const applyToggleHide = useCallback(
    (id: string) => onChange(isHidden(prefs, id) ? showWidget(prefs, id) : hideWidget(prefs, id)),
    [prefs, onChange],
  );
  const applyToggleCollapse = useCallback(
    (id: string) => onChange(toggleCollapsed(prefs, id)),
    [prefs, onChange],
  );
  const applyMove = useCallback(
    (id: string, dir: "up" | "down") => onChange(moveWidget(prefs, id, dir, device)),
    [prefs, onChange, device],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Customize dashboard"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 900,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: "min(420px, 100%)",
          height: "100dvh",
          background: "var(--eb-bg)",
          borderLeft: "1px solid var(--eb-border)",
          overflowY: "auto",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontFamily: "var(--eb-head)", fontSize: 16, letterSpacing: 2 }}>
            CUSTOMIZE DASHBOARD
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customization drawer"
            style={{
              background: "transparent",
              color: "var(--eb-muted)",
              border: "1px solid var(--eb-border)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </header>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onChange(resetDesktop(prefs))} style={smallBtn}>
            Reset desktop
          </button>
          <button type="button" onClick={() => onChange(resetMobile(prefs))} style={smallBtn}>
            Reset mobile
          </button>
          <button type="button" onClick={() => onChange(resetAll())} style={smallBtn}>
            Reset all
          </button>
        </div>

        {bySection.map(([section, items]) => (
          <section key={section} aria-labelledby={`sec-${section}`}>
            <h3
              id={`sec-${section}`}
              style={{
                fontFamily: "var(--eb-mono)",
                fontSize: 10,
                letterSpacing: 1.2,
                color: "var(--eb-muted)",
                margin: "12px 0 6px",
                textTransform: "uppercase",
              }}
            >
              {section}
            </h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((w) => {
                const required = REQUIRED_WIDGET_IDS.includes(w.id) || w.required;
                const hidden = isHidden(prefs, w.id);
                const collapsed = isCollapsed(prefs, w.id);
                return (
                  <li
                    key={w.id}
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      padding: 8,
                      border: "1px solid var(--eb-border)",
                      borderRadius: 6,
                      background: "var(--eb-card, rgba(255,255,255,0.02))",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {w.title}
                      {required ? (
                        <span style={{ fontSize: 9, marginLeft: 6, color: "var(--eb-neutral)" }} aria-label="Required widget">
                          REQUIRED
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      aria-label={`Move ${w.title} up`}
                      onClick={() => applyMove(w.id, "up")}
                      style={smallBtn}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${w.title} down`}
                      onClick={() => applyMove(w.id, "down")}
                      style={smallBtn}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={collapsed ? `Expand ${w.title}` : `Collapse ${w.title}`}
                      aria-pressed={collapsed}
                      onClick={() => applyToggleCollapse(w.id)}
                      style={smallBtn}
                    >
                      {collapsed ? "Expand" : "Collapse"}
                    </button>
                    <button
                      type="button"
                      aria-label={hidden ? `Show ${w.title}` : `Hide ${w.title}`}
                      aria-pressed={hidden}
                      onClick={() => applyToggleHide(w.id)}
                      disabled={required}
                      title={required ? "Required widgets cannot be hidden" : undefined}
                      style={{
                        ...smallBtn,
                        opacity: required ? 0.4 : 1,
                        cursor: required ? "not-allowed" : "pointer",
                      }}
                    >
                      {hidden ? "Show" : "Hide"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  fontFamily: "var(--eb-mono)",
  fontSize: 11,
  padding: "4px 8px",
  minHeight: 28,
  borderRadius: 4,
  border: "1px solid var(--eb-border)",
  background: "transparent",
  color: "var(--eb-text)",
  cursor: "pointer",
};

export default CustomizeDashboardDrawer;