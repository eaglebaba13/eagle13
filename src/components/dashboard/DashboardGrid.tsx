import { lazy, Suspense, useMemo } from "react";
import {
  DASHBOARD_WIDGETS,
  applyPreferences,
  resolveWidgetsForContext,
  type DashboardPreferences,
  type ResolveContext,
  type WidgetDefinition,
} from "@/lib/dashboard-widgets";
import { DashboardWidgetSkeleton } from "./DashboardStates";

type Props = {
  device: "desktop" | "tablet" | "mobile";
  context: ResolveContext;
  preferences?: DashboardPreferences;
  widgets?: WidgetDefinition[];
};

/**
 * Shared registry-driven dashboard renderer.
 *
 * Both desktop and mobile consume the same widget set from
 * `DASHBOARD_WIDGETS`. Only layout (spans, ordering) differs by device.
 * This component is intentionally decoupled from data fetching — each
 * widget component reads its own dependency via TanStack Query, and
 * widgets sharing a dependency reuse the same query key from
 * `DATA_DEPENDENCY_QUERY_KEY`.
 */
export function DashboardGrid({ device, context, preferences, widgets = DASHBOARD_WIDGETS }: Props) {
  const filtered = useMemo(() => resolveWidgetsForContext(context, widgets), [context, widgets]);
  const ordered = useMemo(
    () =>
      applyPreferences(filtered, preferences ?? {
        hidden: [],
        collapsed: [],
        desktopOrder: [],
        mobileOrder: [],
      }, device === "mobile" ? "mobile" : "desktop"),
    [filtered, preferences, device],
  );

  const gridStyle: React.CSSProperties =
    device === "mobile"
      ? { display: "flex", flexDirection: "column", gap: 14 }
      : device === "tablet"
        ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 }
        : { display: "grid", gridTemplateColumns: "repeat(12, minmax(0,1fr))", gap: 14 };

  return (
    <div style={gridStyle} data-eb-dashboard-grid={device}>
      {ordered.map((w) => (
        <WidgetSlot key={w.id} widget={w} device={device} />
      ))}
    </div>
  );
}

function WidgetSlot({ widget, device }: { widget: WidgetDefinition; device: "desktop" | "tablet" | "mobile" }) {
  const Lazy = useMemo(() => lazy(widget.componentLoader), [widget]);
  const span =
    device === "desktop"
      ? { gridColumn: `span ${widget.desktopSpan} / span ${widget.desktopSpan}` }
      : device === "tablet"
        ? { gridColumn: `span ${widget.tabletSpan} / span ${widget.tabletSpan}` }
        : {};
  return (
    <div style={span} data-eb-widget-id={widget.id}>
      <Suspense fallback={<DashboardWidgetSkeleton title={widget.title} />}>
        <Lazy />
      </Suspense>
    </div>
  );
}

export default DashboardGrid;