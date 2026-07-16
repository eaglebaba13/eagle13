import {
  DASHBOARD_WIDGETS,
  auditWidgetRegistry,
  desktopWidgets,
  mobileWidgets,
  resolveWidgetsForContext,
  type ResolveContext,
} from "@/lib/dashboard-widgets";
import {
  resolveDesktopNav,
  resolveMobileDrawerNav,
  type NavContext,
} from "@/lib/navigation";

type Props = {
  widgetContext: ResolveContext;
  navContext?: NavContext;
};

/**
 * Dev-only parity diagnostic. Shows every registry symptom that would
 * indicate desktop/mobile drift, missing loaders, or duplicate deps.
 *
 * Never render in production. This is a debug surface.
 */
export function DashboardParityDiagnostic({ widgetContext, navContext }: Props) {
  const audit = auditWidgetRegistry();
  const desktop = desktopWidgets(widgetContext).map((w) => w.id);
  const mobile = mobileWidgets(widgetContext).map((w) => w.id);
  const parityOk = desktop.slice().sort().join(",") === mobile.slice().sort().join(",");

  const nav = navContext ?? {};
  const navDesk = resolveDesktopNav(nav).map((n) => n.id);
  const navMob = resolveMobileDrawerNav(nav).map((n) => n.id);
  const navParityOk = navDesk.slice().sort().join(",") === navMob.slice().sort().join(",");

  const hiddenByPlan = DASHBOARD_WIDGETS.filter(
    (w) => !resolveWidgetsForContext(widgetContext).some((r) => r.id === w.id) && w.enabled,
  ).map((w) => `${w.id} (min=${w.minimumPlan})`);

  return (
    <section
      style={{
        border: "1px dashed var(--eb-neutral, #6b7280)",
        padding: 14,
        margin: "16px 0",
        borderRadius: 8,
        fontFamily: "var(--eb-mono)",
        fontSize: 12,
        color: "var(--eb-muted)",
      }}
    >
      <h3 style={{ margin: 0, marginBottom: 8, color: "var(--eb-text)", fontSize: 13 }}>
        Dashboard Parity Diagnostic (dev)
      </h3>
      <ul style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 4 }}>
        <li>Registered widgets: <b>{audit.registered}</b></li>
        <li>Duplicate IDs: {audit.duplicateIds.length ? audit.duplicateIds.join(", ") : "none"}</li>
        <li>Missing loaders: {audit.missingLoaders.length ? audit.missingLoaders.join(", ") : "none"}</li>
        <li>Duplicate query deps: {audit.duplicateQueryDependencies.join(", ") || "none"}</li>
        <li>Unconsumed deps: {audit.unconsumedDependencies.join(", ") || "none"}</li>
        <li>Desktop rendered: {desktop.length} · Mobile rendered: {mobile.length} · parity: <b>{parityOk ? "OK" : "MISMATCH"}</b></li>
        <li>Nav parity: <b>{navParityOk ? "OK" : "MISMATCH"}</b> (desktop={navDesk.length}, mobile={navMob.length})</li>
        <li>Hidden by plan/role: {hiddenByPlan.join(", ") || "none"}</li>
      </ul>
    </section>
  );
}

export default DashboardParityDiagnostic;