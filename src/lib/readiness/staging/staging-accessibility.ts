import type { StagingCheck } from "./staging-validation-types";

export interface AccessibilityObservation {
  keyboardNav: boolean;
  visibleFocus: boolean;
  focusTrap: boolean;
  accessibleLabels: boolean;
  tableScrolling: boolean;
  contrast: boolean;
  statusNotColorOnly: boolean;
  desktopOverflow: boolean;
  tabletOverflow: boolean;
  mobileOverflow: boolean;
  clippedControls: boolean;
  hydrationMismatch: boolean;
}

export function auditAccessibility(o: AccessibilityObservation): StagingCheck[] {
  const checks: StagingCheck[] = [];
  const push = (id: string, ok: boolean, title: string, severity: StagingCheck["severity"] = "warning") => {
    checks.push({
      id: `a11y.${id}`,
      category: "ACCESSIBILITY",
      title,
      status: ok ? "PASS" : "FAIL",
      severity: ok ? "info" : severity,
    });
  };
  push("keyboard", o.keyboardNav, "Keyboard navigation");
  push("focus_visible", o.visibleFocus, "Visible focus");
  push("focus_trap", o.focusTrap, "Drawer/modal focus trap");
  push("labels", o.accessibleLabels, "Accessible labels");
  push("table_scroll", o.tableScrolling, "Table scrolling");
  push("contrast", o.contrast, "Contrast", "critical");
  push("status_not_color_only", o.statusNotColorOnly, "Status not color-only");
  push("desktop_overflow", !o.desktopOverflow, "No desktop overflow");
  push("tablet_overflow", !o.tabletOverflow, "No tablet overflow");
  push("mobile_overflow", !o.mobileOverflow, "No mobile overflow", "critical");
  push("clipped", !o.clippedControls, "No clipped controls");
  push("hydration", !o.hydrationMismatch, "No hydration mismatch", "critical");
  return checks;
}